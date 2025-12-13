import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Client } from '@gradio/client';
import { firstValueFrom } from 'rxjs';

interface ProcessFrameResponse {
  success: boolean;
  frame?: string;
  error?: string;
}

@Injectable()
export class AIEngineService {
  private readonly logger = new Logger(AIEngineService.name);
  private readonly hfVtoUrl: string;
  private readonly localVtoUrl: string;
  private readonly useHuggingFace: boolean;
  private isHealthy = false;
  private gradioClient: any = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.hfVtoUrl = this.configService.get<string>('HF_VTO_URL')!;
    this.localVtoUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:5001');
    
    // ✅ Décider quelle source utiliser selon l'environnement
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    this.useHuggingFace = nodeEnv === 'production' || !this.localVtoUrl.includes('localhost');
    
    if (this.useHuggingFace) {
      this.logger.log(`🌐 Mode PRODUCTION : Utilisation Hugging Face`);
      this.logger.log(`   HF VTO URL: ${this.hfVtoUrl}`);
      this.initializeGradioClient();
    } else {
      this.logger.log(`💻 Mode DÉVELOPPEMENT : Utilisation Python local`);
      this.logger.log(`   Local VTO URL: ${this.localVtoUrl}`);
      this.checkLocalHealth();
    }
  }

  /**
   * Initialise le client Gradio (Hugging Face)
   */
  private async initializeGradioClient() {
    try {
      this.logger.log('🔄 Connexion au Space Hugging Face VTO...');
      
      const spaceUrl = this.hfVtoUrl;
      const match = spaceUrl.match(/https:\/\/([^-]+)-([^.]+)\.hf\.space/);
      
      let spaceName: string;
      if (match) {
        spaceName = `${match[1]}/${match[2]}`;
      } else {
        spaceName = spaceUrl;
      }
      
      this.logger.log(`   Connexion à: ${spaceName}`);
      
      this.gradioClient = await Client.connect(spaceName);
      this.isHealthy = true;
      
      this.logger.log(`✅ Connexion Gradio établie`);
    } catch (error) {
      this.isHealthy = false;
      this.logger.error(`❌ Échec connexion Gradio: ${error.message}`);
      
      // Retry après 30s
      setTimeout(() => this.initializeGradioClient(), 30000);
    }
  }

  /**
   * Vérifie la santé du service Python local
   */
  private async checkLocalHealth() {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.localVtoUrl}/health`, { timeout: 5000 }),
      );
      
      this.isHealthy = response.status === 200;
      if (this.isHealthy) {
        this.logger.log(`✅ Service VTO Python local opérationnel`);
      }
    } catch (error) {
      this.isHealthy = false;
      this.logger.warn(`⚠️ Service VTO Python local indisponible`);
      this.logger.warn(`   Assurez-vous que "python main.py" est lancé`);
    }
  }

  /**
   * ✅ MÉTHODE PRINCIPALE : Route automatiquement vers HF ou Local
   */
  async processFrameWithClothes(
    frameBase64: string,
    clothes: Array<{
      imageURL: string;
      processedImageURL?: string;
      category: string;
    }>,
  ): Promise<ProcessFrameResponse> {
    if (this.useHuggingFace) {
      return this.processWithHuggingFace(frameBase64, clothes);
    } else {
      return this.processWithLocal(frameBase64, clothes);
    }
  }

  /**
   * Traitement via Hugging Face (Gradio Client)
   */
  private async processWithHuggingFace(
    frameBase64: string,
    clothes: Array<{ imageURL: string; processedImageURL?: string; category: string }>,
  ): Promise<ProcessFrameResponse> {
    if (!this.gradioClient) {
      this.logger.warn('⚠️ Gradio Client non initialisé, reconnexion...');
      await this.initializeGradioClient();
      
      if (!this.gradioClient) {
        return { success: false, error: 'Service VTO HF non disponible' };
      }
    }

    try {
      const clothesData = clothes.map(cloth => ({
        imageURL: cloth.processedImageURL || cloth.imageURL,
        processedImageURL: cloth.processedImageURL,
        category: cloth.category,
      }));

      this.logger.debug(`📤 HF VTO: ${clothesData.length} vêtement(s)`);
      
      // Nettoyer le base64
      let cleanBase64 = frameBase64;
      if (frameBase64.startsWith('data:')) {
        cleanBase64 = frameBase64.split(',')[1];
      }

      // Appel Gradio
      const result = await this.gradioClient.predict('/predict', {
        frame_base64: cleanBase64,
        clothes_json: JSON.stringify(clothesData),
      });

      const vtoResult = JSON.parse(result.data[0]);

      if (!vtoResult.success) {
        return { success: false, error: vtoResult.error || 'Erreur VTO' };
      }

      return { success: true, frame: vtoResult.frame };

    } catch (error) {
      this.logger.error(`❌ Erreur HF VTO: ${error.message}`);
      
      if (error.message.includes('Connection')) {
        this.gradioClient = null;
        await this.initializeGradioClient();
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Traitement via Python local (FastAPI)
   */
  private async processWithLocal(
    frameBase64: string,
    clothes: Array<{ imageURL: string; processedImageURL?: string; category: string }>,
  ): Promise<ProcessFrameResponse> {
    try {
      const clothesData = clothes.map(cloth => ({
        imageURL: cloth.processedImageURL || cloth.imageURL,
        category: cloth.category,
      }));

      this.logger.debug(`📤 Local VTO: ${clothesData.length} vêtement(s)`);

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.localVtoUrl}/process-frame`,
          {
            frame: frameBase64,
            clothes: clothesData,
          },
          { timeout: 10000 },
        ),
      );

      const result = response.data;

      if (!result.success) {
        return { success: false, error: result.error || 'Erreur VTO local' };
      }

      return { success: true, frame: result.frame };

    } catch (error) {
      this.logger.error(`❌ Erreur VTO local: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Vérifie la santé du service
   */
  async checkHealth(): Promise<boolean> {
    if (this.useHuggingFace) {
      return this.isHealthy && this.gradioClient !== null;
    } else {
      await this.checkLocalHealth();
      return this.isHealthy;
    }
  }

  /**
   * Retourne l'état du service
   */
  getHealthStatus(): boolean {
    return this.isHealthy;
  }
}