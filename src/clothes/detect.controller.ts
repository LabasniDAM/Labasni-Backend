// src/clothes/detect.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as cloudinary } from 'cloudinary';
import { DetectionService, DetectionResult } from './services/detection.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { ClothesService } from './clothes.service';
import { Clothes } from './schemas/clothes.schema'; // ✅ Import Clothes (pas ClothesDocument)

@Controller('detect')
@UseGuards(JwtAuthGuard)
export class DetectController {
  private readonly logger = new Logger(DetectController.name);

  constructor(
    private readonly detectionService: DetectionService,
    private readonly clothesService: ClothesService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          return cb(new BadRequestException('Seules les images sont acceptées'), false);
        }
        cb(null, true);
      },
    }),
  )
  async detect(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() user: any,
  ): Promise<{
    success: boolean;
    message: string;
    cloth: any;
    image_url: string;
    public_id: string;
    detection: DetectionResult;
  }> {
    if (!file) {
      throw new BadRequestException('Photo requise');
    }

    if (!user?.id) {
      throw new BadRequestException('Utilisateur non authentifié');
    }

    this.logger.log(`📸 Nouvelle détection pour user ${user.id}`);

    try {
      // ÉTAPE 1 : Détection via Hugging Face
      this.logger.log('🤖 Appel Hugging Face...');
      const detection = await this.detectionService.detectCloth(
        file.buffer,
        file.originalname,
      );

      // ÉTAPE 2 : Upload sur Cloudinary
      this.logger.log('☁️ Upload Cloudinary...');
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'labasni/clothes',
            format: 'png',
            resource_type: 'image',
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          },
        );

        const { Readable } = require('stream');
        const stream = Readable.from(file.buffer);
        stream.pipe(uploadStream);
      });

      this.logger.log(`✅ Upload terminé: ${uploadResult.secure_url}`);

      // ÉTAPE 3 : Sauvegarder dans la base de données
      this.logger.log('💾 Sauvegarde en base de données...');
      const cloth: Clothes = await this.clothesService.create({ // ✅ Type Clothes (pas ClothesDocument)
        userId: user.id,
        imageURL: uploadResult.secure_url,
        category: detection.type,
        color: detection.color,
        style: detection.style,
        season: detection.season,
        processingStatus: 'pending',
      });

      // ✅ Conversion sécurisée de _id en string
      const clothId = (cloth as any)._id ? String((cloth as any)._id) : 'unknown';
      this.logger.log(`✅ Vêtement créé: ${clothId}`);

      // RETOUR
      return {
        success: true,
        message: 'Vêtement détecté et sauvegardé avec succès',
        cloth: {
          id: clothId, // ✅ Utilisation de la variable convertie
          imageURL: cloth.imageURL,
          category: cloth.category,
          color: cloth.color,
          style: cloth.style,
          season: cloth.season,
          processingStatus: cloth.processingStatus,
        },
        image_url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
        detection: detection,
      };

    } catch (error: any) {
      this.logger.error('❌ Erreur complète:', error.message);
      
      if (error.response) {
        this.logger.error('Réponse API:', error.response.data);
      }

      throw new BadRequestException(
        error.message || 'Erreur lors de la détection',
      );
    }
  }
}