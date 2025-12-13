import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Clothes, ClothesDocument } from 'src/clothes/schemas/clothes.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly hfRecommenderUrl: string;

  constructor(
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
    private subscriptionsService: SubscriptionsService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.hfRecommenderUrl = this.configService.get<string>('HF_RECOMMENDER_URL')!;
    
    if (!this.hfRecommenderUrl) {
      this.logger.error('⚠️ HF_RECOMMENDER_URL non configurée dans .env');
    } else {
      this.logger.log(`✅ Hugging Face Recommender configuré : ${this.hfRecommenderUrl}`);
    }
  }

  async recommendOutfit(
    userId: string,
    preference: string,
    city?: string,
    temperature?: number,
  ): Promise<any> {
    this.logger.log('📊 [Recommendations] Vérification du quota...');
    const quotaCheck = await this.subscriptionsService.canGenerateOutfit(userId);

    if (!quotaCheck.allowed) {
      this.logger.log(`❌ [Recommendations] Quota atteint pour user ${userId}`);
      throw new ForbiddenException(
        quotaCheck.message || 'You have reached your monthly limit for outfit suggestions.',
      );
    }

    this.logger.log(`✅ [Recommendations] Quota OK - Remaining: ${quotaCheck.remaining}`);

    try {
      this.logger.log('🎽 [Recommendations] Début de la recommandation...');
      this.logger.log(`   User ID: ${userId}`);
      this.logger.log(`   Préférence: ${preference}`);
      this.logger.log(`   Ville: ${city || 'Tunis'}`);

      const normalizedPreference = preference.toLowerCase().trim();
      const cityParam = city || 'Tunis';

      // 1. Récupérer les vêtements
      const userClothes = await this.clothesModel
        .find({ userId: new Types.ObjectId(userId) })
        .exec();

      this.logger.log(`   📦 ${userClothes.length} vêtements trouvés`);

      if (userClothes.length < 3) {
        throw new BadRequestException(
          `You only have ${userClothes.length} item(s) in your wardrobe. Please add at least 3 items.`,
        );
      }

      // 2. Préparer les données
      const clothesData = userClothes.map((cloth) => {
        let category = cloth.category?.toLowerCase() || 'top';
        const categoryMap: { [key: string]: string } = {
          'tshirt': 'top', 't-shirt': 'top', 'shirt': 'top', 'top': 'top',
          'robe': 'top', 'dress': 'top', 'jacket': 'top',
          'pantalon': 'bottom', 'pants': 'bottom', 'jean': 'bottom',
          'jeans': 'bottom', 'bottom': 'bottom',
          'shoes': 'footwear', 'shoe': 'footwear', 'footwear': 'footwear',
          'sneakers': 'footwear', 'chaussures': 'footwear',
        };
        category = categoryMap[category.toLowerCase()] || category;

        let season = cloth.season?.toLowerCase() || 'all';
        const seasonMap: { [key: string]: string } = {
          'été': 'summer', 'ete': 'summer', 'hiver': 'winter',
          'automne': 'fall', 'printemps': 'spring',
          'all': 'all', 'toutes': 'all',
        };
        season = seasonMap[season] || season;

        let style = cloth.style?.toLowerCase().trim() || 'casual';
        if (style.includes('formal')) style = 'formal';
        else if (style.includes('sport')) style = 'sport';
        else if (style.includes('casual')) style = 'casual';
        else if (style.includes('elegant')) style = 'elegant';
        else if (['robe', 'dress', 'tshirt', 'pantalon', 'shoes'].includes(style)) {
          style = 'casual';
        }

        return {
          id: (cloth._id as Types.ObjectId).toString(),
          category: category,
          color: cloth.color?.toLowerCase() || 'unknown',
          style: style,
          season: season,
          score: this.calculateScore(cloth.acceptedCount, cloth.rejectedCount),
          imageURL: cloth.imageURL,
        };
      });

      this.logger.log(`   📊 Vêtements préparés : ${clothesData.length} items`);

      // 3. Vérifier les catégories
      const byCategory = clothesData.reduce((acc, cloth) => {
        if (!acc[cloth.category]) acc[cloth.category] = [];
        acc[cloth.category].push(cloth);
        return acc;
      }, {} as Record<string, any[]>);

      const topsWithStyle = byCategory['top']?.filter(c => c.style === normalizedPreference).length || 0;
      const bottomsWithStyle = byCategory['bottom']?.filter(c => c.style === normalizedPreference).length || 0;
      const footwearWithStyle = byCategory['footwear']?.filter(c => c.style === normalizedPreference).length || 0;

      if (!topsWithStyle || !bottomsWithStyle || !footwearWithStyle) {
        const missing: string[] = [];
        if (!topsWithStyle) missing.push('top');
        if (!bottomsWithStyle) missing.push('bottom');
        if (!footwearWithStyle) missing.push('shoes');

        throw new BadRequestException(
          `Missing items for "${normalizedPreference}" style: ${missing.join(', ')}. You need at least one item of each category with this style.`,
        );
      }

      // 4. ✅ APPEL HUGGING FACE - Endpoint confirmé par test
      const baseUrl = this.hfRecommenderUrl.replace(/\/$/, '');
      
      // ✅ Endpoint confirmé par votre test Gradio Client
      const apiUrl = `${baseUrl}/api/predict`;
      
      // ✅ Payload exact confirmé par le test
      const payload = {
        data: [
          JSON.stringify(clothesData), // Paramètre 1: clothes_json (string JSON)
          normalizedPreference,         // Paramètre 2: preference
          cityParam,                    // Paramètre 3: city
        ],
      };

      this.logger.log(`📡 Appel Hugging Face API: ${apiUrl}`);
      this.logger.log(`   Payload size: ${JSON.stringify(payload).length} chars`);
      this.logger.debug(`   Payload preview: ${JSON.stringify(payload).substring(0, 200)}...`);

      let hfResult: any = null;

      try {
        // ✅ Appel HTTP avec le format exact qui fonctionne
        const response = await firstValueFrom(
          this.httpService.post(apiUrl, payload, {
            timeout: 30000, // 30 secondes
            headers: {
              'Content-Type': 'application/json',
            },
            validateStatus: (status) => status === 200,
          }),
        );

        this.logger.log(`✅ Réponse reçue (Status: ${response.status})`);

        // ✅ Parser la réponse Gradio
        // Format: { data: ["json_string"], duration: 1.234 }
        const responseData = response.data;
        
        if (responseData?.data && Array.isArray(responseData.data)) {
          const resultString = responseData.data[0];
          hfResult = JSON.parse(resultString);
          
          this.logger.log(`✅ Réponse ML parsée avec succès`);
          this.logger.log(`   Success: ${hfResult.success}`);
          
          if (hfResult.weather) {
            this.logger.log(`   Météo: ${hfResult.weather.temperature}°C, ${hfResult.weather.condition}`);
          }
        } else {
          this.logger.error(`❌ Format de réponse inattendu: ${JSON.stringify(responseData)}`);
          throw new Error('Format de réponse Hugging Face invalide');
        }

      } catch (error: any) {
        const statusCode = error.response?.status || error.code;
        const errorMessage = error.response?.data?.error || error.message;

        this.logger.error(`❌ Erreur Hugging Face API (${statusCode}): ${errorMessage}`);

        // Erreurs spécifiques
        if (error.code === 'ECONNABORTED') {
          throw new HttpException(
            'Le service de recommandation prend trop de temps. Réessayez dans quelques secondes.',
            HttpStatus.REQUEST_TIMEOUT,
          );
        }

        if (statusCode === 404) {
          throw new HttpException(
            'Le service de recommandation est introuvable. Vérifiez la configuration HF_RECOMMENDER_URL.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        if (error.code === 'ECONNREFUSED' || statusCode === 503) {
          throw new HttpException(
            'Le service de recommandation est actuellement indisponible. Vérifiez que votre Space Hugging Face est Running.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        // Autres erreurs
        throw new HttpException(
          `Erreur lors de la communication avec le service ML: ${errorMessage}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      // 5. Vérifier le résultat
      if (!hfResult) {
        throw new HttpException(
          'Aucune réponse reçue du service ML',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // ✅ Gérer le cas où le modèle ne trouve pas d'outfit
      if (!hfResult.success) {
        const errorMessage = hfResult.message || 'Unable to generate recommendation';
        
        this.logger.warn(`⚠️ Le modèle ML a retourné success=false: ${errorMessage}`);
        
        // Messages d'erreur spécifiques
        if (errorMessage.includes('saison') || errorMessage.includes('season')) {
          throw new BadRequestException(
            `Cannot generate outfit: ${errorMessage}. Please add clothes suitable for the current season or mark your clothes as suitable for all seasons.`
          );
        }
        
        throw new BadRequestException(errorMessage);
      }

      if (!hfResult.outfit) {
        throw new BadRequestException('No outfit was generated by the ML model');
      }

      // 6. Récupérer les détails complets des vêtements recommandés
      const [topCheck, bottomCheck, footwearCheck] = await Promise.all([
        this.clothesModel.findById(hfResult.outfit.top).exec(),
        this.clothesModel.findById(hfResult.outfit.bottom).exec(),
        this.clothesModel.findById(hfResult.outfit.footwear).exec(),
      ]);

      if (!topCheck || !bottomCheck || !footwearCheck) {
        this.logger.error(`❌ Vêtements recommandés introuvables en DB`);
        this.logger.error(`   Top: ${hfResult.outfit.top} - ${topCheck ? 'OK' : 'NOT FOUND'}`);
        this.logger.error(`   Bottom: ${hfResult.outfit.bottom} - ${bottomCheck ? 'OK' : 'NOT FOUND'}`);
        this.logger.error(`   Footwear: ${hfResult.outfit.footwear} - ${footwearCheck ? 'OK' : 'NOT FOUND'}`);
        
        throw new NotFoundException('Some recommended items were not found in database');
      }

      // 7. Incrémenter le compteur
      this.logger.log(`✅ [Recommendations] Incrémentation du compteur pour user ${userId}`);
      await this.subscriptionsService.incrementOutfitSuggestion(userId);

      // 8. Construire la réponse finale
      const finalResponse = {
        success: true,
        outfit: {
          top: this.formatClothResponse(topCheck),
          bottom: this.formatClothResponse(bottomCheck),
          footwear: this.formatClothResponse(footwearCheck),
        },
        metadata: {
          weather: hfResult.weather || {},
          season: hfResult.season || 'unknown',
          preference: preference,
          explanation: hfResult.explanation || {},
        },
        clothesIds: [
          (topCheck._id as Types.ObjectId).toString(),
          (bottomCheck._id as Types.ObjectId).toString(),
          (footwearCheck._id as Types.ObjectId).toString(),
        ],
      };

      this.logger.log(`✅ [Recommendations] Recommandation générée avec succès`);
      
      return finalResponse;

    } catch (error: any) {
      this.logger.error('❌ [Recommendations] Erreur:', error.message);
      
      if (error.stack) {
        this.logger.debug('Stack trace:', error.stack);
      }

      // Propager les exceptions HTTP déjà formatées
      if (error instanceof BadRequestException ||
          error instanceof NotFoundException ||
          error instanceof ForbiddenException ||
          error instanceof HttpException) {
        throw error;
      }

      // Autres erreurs
      throw new BadRequestException(`Recommendation failed: ${error.message}`);
    }
  }

  /**
   * ✅ Calcul du score corrigé (toujours entre 0 et 1)
   */
  private calculateScore(accepts: number, rejects: number): number {
    const total = accepts + rejects;
    
    // Si aucune interaction, score neutre
    if (total === 0) return 0.5;
    
    // Score normalisé entre 0 et 1
    // (accepts - rejects) / total donne entre -1 et 1
    // On transforme en 0-1: (score + 1) / 2
    const rawScore = (accepts - rejects) / total;
    return Math.max(0, Math.min(1, (rawScore + 1) / 2));
  }

  private formatClothResponse(cloth: ClothesDocument): any {
    return {
      _id: (cloth._id as Types.ObjectId).toString(),
      imageURL: cloth.imageURL,
      category: cloth.category,
      color: cloth.color,
      style: cloth.style,
      season: cloth.season,
      userId: (cloth.userId as Types.ObjectId).toString(),
      acceptedCount: cloth.acceptedCount,
      rejectedCount: cloth.rejectedCount,
    };
  }
}