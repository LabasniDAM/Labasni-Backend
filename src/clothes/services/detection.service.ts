// src/clothes/services/detection.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';

// ✅ EXPORTÉ pour résoudre TS4053
export interface DetectionResult {
  type: string;
  color: string;
  style: string;
  season: string;
}

@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);
  private readonly hfApiUrl: string; // ✅ Type string (non undefined)

  constructor(private configService: ConfigService) {
    // ✅ Valeur par défaut si variable manquante
    this.hfApiUrl = this.configService.get<string>('HUGGINGFACE_API_URL') || '';
    
    if (!this.hfApiUrl) {
      this.logger.warn('⚠️ HUGGINGFACE_API_URL non configurée - Détection désactivée');
    } else {
      this.logger.log(`✅ Detection Service initialisé: ${this.hfApiUrl}`);
    }
  }

  async detectCloth(
    photoBuffer: Buffer,
    filename: string,
  ): Promise<DetectionResult> {
    if (!this.hfApiUrl) {
      throw new HttpException(
        'Service de détection non configuré',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      this.logger.log('🔍 Appel API Hugging Face pour détection...');

      const formData = new FormData();
      formData.append('photo', photoBuffer, {
        filename: filename,
        contentType: 'image/jpeg',
      });

      const startTime = Date.now();

      const response = await axios.post(`${this.hfApiUrl}/detect`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 90000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Détection réussie en ${duration}ms`);

      if (!response.data.success) {
        throw new HttpException(
          response.data.error || 'Détection échouée',
          HttpStatus.BAD_REQUEST,
        );
      }

      const detection = response.data.detection;
      if (!detection || !detection.type || !detection.color) {
        throw new HttpException(
          'Réponse de détection invalide',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.log(`📊 Détection: ${detection.type}, ${detection.color}, ${detection.style}, ${detection.season}`);

      return {
        type: detection.type,
        color: detection.color,
        style: detection.style || 'casual',
        season: detection.season || 'spring',
      };

    } catch (error: any) {
      this.logger.error(`❌ Erreur détection HF: ${error.message}`);

      if (error.response) {
        this.logger.error(`Status: ${error.response.status}`);
        this.logger.error(`Data:`, error.response.data);
      }

      if (error.code === 'ECONNABORTED') {
        throw new HttpException(
          'Délai d\'attente de détection dépassé',
          HttpStatus.REQUEST_TIMEOUT,
        );
      }

      throw new HttpException(
        'Erreur lors de la détection du vêtement',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.hfApiUrl) {
      return false;
    }

    try {
      const response = await axios.get(`${this.hfApiUrl}/`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      this.logger.error('❌ Health check failed:', error.message);
      return false;
    }
  }
}