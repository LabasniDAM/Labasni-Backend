// src/clothes/detect.controller.ts - VERSION CORRIGÉE (sans sauvegarde BD)
import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { v2 as cloudinary } from 'cloudinary';
import { DetectionService } from './services/detection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('Detection')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('detect')
export class DetectController {
  private readonly logger = new Logger(DetectController.name);

  constructor(
    private readonly detectionService: DetectionService,
  ) {}

  /**
   * Health check du service de détection
   */
  @Get('health')
  @ApiOperation({ summary: 'Vérifier l\'état du service de détection' })
  async healthCheck() {
    try {
      const health = await this.detectionService.healthCheck();
      return health;
    } catch (error: any) {
      throw new HttpException(
        `Service indisponible: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * POST /detect
   * Détecte un vêtement et upload sur Cloudinary
   * ✅ NE SAUVEGARDE PLUS EN BD (sauvegarde uniquement via POST /clothes)
   * 
   * Retourne :
   * {
   *   "detection": { type, color, style, season },
   *   "confidence": { detection, style, season },
   *   "image_url": "https://cloudinary.com/..."
   * }
   */
  @Post()
  @ApiOperation({ 
    summary: 'Détecter un vêtement depuis une photo',
    description: 'Upload une photo, détecte le vêtement via IA, et upload sur Cloudinary. Ne sauvegarde PAS en BD.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photo: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB max
      },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif)$/)) {
          return cb(
            new BadRequestException('Seules les images (JPEG, PNG, WebP) sont acceptées'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async detect(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ) {
    // Validation
    if (!file) {
      throw new BadRequestException('Aucune photo fournie');
    }

    if (!user?.id) {
      throw new BadRequestException('Utilisateur non authentifié');
    }

    this.logger.log(`📸 Détection pour user ${user.id} | Fichier: ${file.originalname}`);

    try {
      // ====================================
      // ÉTAPE 1 : DÉTECTION VIA HUGGING FACE
      // ====================================
      this.logger.log('🤖 [1/2] Appel Hugging Face...');
      
      const { detection, confidence } = await this.detectionService.detectCloth(
        file.buffer,
        file.originalname,
      );

      this.logger.log(
        `✅ Détection OK: ${detection.type} (confiance: ${(confidence.detection * 100).toFixed(1)}%)`
      );

      // ====================================
      // ÉTAPE 2 : UPLOAD SUR CLOUDINARY
      // ====================================
      this.logger.log('☁️  [2/2] Upload Cloudinary...');
      
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'labasni/clothes',
            format: 'jpg',
            resource_type: 'image',
            transformation: [
              { width: 1024, height: 1024, crop: 'limit' },
            ],
          },
          (error, result) => {
            if (error) {
              this.logger.error('❌ Erreur Cloudinary:', error);
              return reject(error);
            }
            resolve(result);
          },
        );

        const { Readable } = require('stream');
        const stream = Readable.from(file.buffer);
        stream.pipe(uploadStream);
      });

      this.logger.log(`✅ Upload OK: ${uploadResult.secure_url}`);

      // ====================================
      // RETOUR POUR iOS (sans sauvegarde BD)
      // ====================================
      return {
        detection: {
          type: detection.type,
          color: detection.color,
          style: detection.style,
          season: detection.season,
        },
        confidence: {
          detection: Math.round(confidence.detection * 100) / 100,
          style: Math.round(confidence.style * 100) / 100,
          season: Math.round(confidence.season * 100) / 100,
        },
        image_url: uploadResult.secure_url,
        cloudinary: {
          public_id: uploadResult.public_id,
        },
      };

    } catch (error: any) {
      this.logger.error('❌ Erreur complète:', error.message);
      
      if (error.response) {
        this.logger.error('Détails API:', error.response.data);
      }

      // Gestion des erreurs spécifiques
      if (error.status === HttpStatus.REQUEST_TIMEOUT) {
        throw new HttpException(
          'La détection a pris trop de temps. Veuillez réessayer.',
          HttpStatus.REQUEST_TIMEOUT,
        );
      }

      if (error.status === HttpStatus.SERVICE_UNAVAILABLE) {
        throw new HttpException(
          'Le service de détection est temporairement indisponible.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new BadRequestException(
        error.message || 'Erreur lors de la détection du vêtement',
      );
    }
  }
}