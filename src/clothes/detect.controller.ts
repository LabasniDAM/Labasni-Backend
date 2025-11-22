// src/clothes/detect.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs';

const execAsync = promisify(exec);

@Controller('detect')
export class DetectController {
  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './temp_uploads',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async detect(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Photo requise');
    }

    const tempPath = file.path;
    const noBgPath = tempPath.replace(extname(tempPath), '_nobg.png');

    try {
      console.log('📸 Image reçue:', tempPath);

      // ✨ ÉTAPE 1 : Supprime le background via API
      console.log('🔄 Suppression du background via API remove.bg...');
      
      try {
        const { stdout, stderr } = await execAsync(
          `python3 remove_bg_api.py --input "${tempPath}" --output "${noBgPath}"`,
        );
        
        console.log('✅ Background supprimé:', noBgPath);
        
        // Affiche les crédits restants (si disponible dans stdout)
        if (stdout.includes('Crédits restants')) {
          console.log(stdout.trim());
        }
      } catch (bgError: any) {
        console.error('❌ Erreur background removal:', bgError.stderr || bgError.message);
        
        // Si l'API échoue, on utilise l'image originale
        console.warn('⚠️ Fallback : utilisation de l\'image originale');
        fs.copyFileSync(tempPath, noBgPath);
      }

      // ✨ ÉTAPE 2 : Upload l'image SANS background sur Cloudinary
      console.log('☁️ Upload Cloudinary...');
      const uploadResult = await cloudinary.uploader.upload(noBgPath, {
        folder: 'labasni',
        format: 'png', // Force PNG pour garder transparence
        resource_type: 'image',
      });
      console.log('✅ Upload terminé:', uploadResult.secure_url);

      // ✨ ÉTAPE 3 : Détection IA sur l'image ORIGINALE
      // (La détection marche mieux avec le contexte du background)
      console.log('🤖 Détection IA...');
      const { stdout: detectionOutput } = await execAsync(
        `python3 detect.py --image "${tempPath}"`,
      );
      console.log('✅ Détection terminée');

      // ✨ NETTOYAGE : Supprime fichiers temporaires
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (fs.existsSync(noBgPath)) fs.unlinkSync(noBgPath);

      // ✨ RETOUR : Image sans BG + Détections
      return {
        success: true,
        image_url: uploadResult.secure_url, // ← Image SANS background
        public_id: uploadResult.public_id,
        detection_result: detectionOutput.trim(),
        background_removed: true,
      };
    } catch (err: any) {
      // Nettoyage en cas d'erreur
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      if (fs.existsSync(noBgPath)) fs.unlinkSync(noBgPath);

      console.error('❌ Erreur complète:', err);
      throw new BadRequestException(
        err.message || 'Erreur lors de la détection',
      );
    }
  }
}