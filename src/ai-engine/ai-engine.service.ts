import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
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
  private isHealthy = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Récupérer l'URL du Space VTO depuis .env
    this.hfVtoUrl = this.configService.get<string>('HF_VTO_URL')!;    
    if (!this.hfVtoUrl) {
      this.logger.error('⚠️ HF_VTO_URL non configurée dans .env');
    } else {
      this.logger.log(`✅ Hugging Face VTO configuré : ${this.hfVtoUrl}`);
      this.checkHealth(); // Vérifier au démarrage
    }
  }

  /**
   * Vérifie la santé du service VTO
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(this.hfVtoUrl, { timeout: 5000 }),
      );
      
      this.isHealthy = response.status === 200;
      if (this.isHealthy) {
        this.logger.log(`✅ Service VTO Hugging Face opérationnel`);
      }
      return this.isHealthy;
    } catch (error) {
      this.isHealthy = false;
      this.logger.warn(`⚠️ Service VTO Hugging Face indisponible`);
      return false;
    }
  }

  /**
   * Traite une frame avec Virtual Try-On via Hugging Face
   */
  async processFrameWithClothes(
    frameBase64: string,
    clothes: Array<{
      imageURL: string;
      processedImageURL?: string;
      category: string;
    }>,
  ): Promise<ProcessFrameResponse> {
    if (!this.hfVtoUrl) {
      return {
        success: false,
        error: 'HF_VTO_URL non configurée',
      };
    }

    try {
      // Préparer les données pour Hugging Face
      const clothesData = clothes.map(cloth => ({
        imageURL: cloth.processedImageURL || cloth.imageURL,
        category: cloth.category,
      }));

      this.logger.debug(`📤 Envoi à HF VTO: ${clothesData.length} vêtement(s)`);

      // Appeler le Space Hugging Face
      const hfApiUrl = `${this.hfVtoUrl}/api/predict`;
      
      const response = await firstValueFrom(
        this.httpService.post(hfApiUrl, {
          data: [
            frameBase64,                 // Argument 1 : frame en base64
            JSON.stringify(clothesData), // Argument 2 : clothes JSON
          ],
        }, {
          timeout: 10000, // 10 secondes max
        }),
      );

      // Récupérer le résultat
      const processedFrame = response.data?.data?.[0];

      if (!processedFrame) {
        throw new HttpException(
          'Erreur de traitement VTO',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.debug(`✅ Frame traitée avec succès`);

      return {
        success: true,
        frame: processedFrame, // Image en base64
      };

    } catch (error) {
      this.logger.error(`❌ Erreur VTO: ${error.message}`);
      
      return {
        success: false,
        error: error.message || 'Erreur inconnue',
      };
    }
  }

  /**
   * Retourne l'état du service VTO
   */
  getHealthStatus(): boolean {
    return this.isHealthy;
  }
}