// src/clothes/services/detection.service.ts
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import axios from 'axios';

export interface DetectionResult {
  type: string;
  color: string;
  style: string;
  season: string;
}

export interface ConfidenceScores {
  detection: number;
  style: number;
  season: number;
}

@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);
  private readonly hfApiUrl: string;

  constructor(private configService: ConfigService) {
    this.hfApiUrl = this.configService.get<string>('HUGGINGFACE_API_URL') || '';
    
    if (!this.hfApiUrl) {
      this.logger.error('❌ HUGGINGFACE_API_URL non configurée dans .env');
      throw new Error('Configuration manquante: HUGGINGFACE_API_URL');
    } else {
      this.logger.log(`✅ Detection Service initialisé: ${this.hfApiUrl}`);
    }
  }

  /**
   * Détecte un vêtement via l'API Hugging Face
   */
  async detectCloth(
    photoBuffer: Buffer,
    filename: string,
  ): Promise<{
    detection: DetectionResult;
    confidence: ConfidenceScores;
  }> {
    try {
      this.logger.log(`🔍 Détection de: ${filename} (${photoBuffer.length} bytes)`);

      // Créer le FormData
      const formData = new FormData();
      formData.append('file', photoBuffer, {
        filename: filename,
        contentType: 'image/jpeg',
      });

      const startTime = Date.now();

      // Appel à l'API Hugging Face
      const response = await axios.post(
        `${this.hfApiUrl}/detect`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 60000, // 60 secondes
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Détection réussie en ${duration}ms`);

      // Validation de la réponse
      if (!response.data || !response.data.success) {
        throw new HttpException(
          response.data?.message || 'Aucun vêtement détecté',
          HttpStatus.BAD_REQUEST,
        );
      }

      const { detection, confidence } = response.data;

      // Validation des données
      if (!detection || !detection.type || !detection.color) {
        throw new HttpException(
          'Réponse de détection invalide',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.log(
        `📊 Résultat: ${detection.type} | ${detection.color} | ${detection.style} | ${detection.season}`
      );
      this.logger.log(
        `📈 Confiance: Detection=${confidence.detection}, Style=${confidence.style}, Season=${confidence.season}`
      );

      return {
        detection: {
          type: detection.type,
          color: detection.color,
          style: detection.style || 'casual',
          season: detection.season || 'all',
        },
        confidence: {
          detection: confidence.detection || 0,
          style: confidence.style || 0,
          season: confidence.season || 0,
        },
      };

    } catch (error: any) {
      this.logger.error(`❌ Erreur détection: ${error.message}`);

      if (error.response) {
        this.logger.error(`Status: ${error.response.status}`);
        this.logger.error(`Data:`, JSON.stringify(error.response.data));
      }

      if (error.code === 'ECONNABORTED') {
        throw new HttpException(
          'Délai d\'attente dépassé (>60s)',
          HttpStatus.REQUEST_TIMEOUT,
        );
      }

      if (error.code === 'ECONNREFUSED') {
        throw new HttpException(
          'API Hugging Face inaccessible',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        `Erreur de détection: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Vérifie l'état de santé de l'API Hugging Face
   */
  async healthCheck(): Promise<{
    status: string;
    api: string;
    reachable: boolean;
  }> {
    try {
      const response = await axios.get(`${this.hfApiUrl}/health`, {
        timeout: 5000,
      });

      return {
        status: response.data.status || 'unknown',
        api: this.hfApiUrl,
        reachable: true,
      };
    } catch (error: any) {
      this.logger.error(`❌ Health check échoué: ${error.message}`);
      
      return {
        status: 'unreachable',
        api: this.hfApiUrl,
        reachable: false,
      };
    }
  }
}