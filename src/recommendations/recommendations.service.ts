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
    // Récupérer l'URL du Space Hugging Face depuis .env
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
    // ✅ Vérifier le quota AVANT
    this.logger.log('📊 [Recommendations] Vérification du quota...');
    const quotaCheck = await this.subscriptionsService.canGenerateOutfit(userId);

    if (!quotaCheck.allowed) {
      this.logger.log(`❌ [Recommendations] Quota atteint pour user ${userId}`);
      throw new ForbiddenException(
        quotaCheck.message || 'You have reached your monthly limit for outfit suggestions. Upgrade to Premium for unlimited suggestions.',
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

      // 1. Récupérer TOUS les vêtements de l'utilisateur
      const userClothes = await this.clothesModel
        .find({ userId: new Types.ObjectId(userId) })
        .exec();

      this.logger.log(`   📦 ${userClothes.length} vêtements trouvés`);

      if (userClothes.length < 3) {
        throw new BadRequestException(
          `You only have ${userClothes.length} item(s) in your wardrobe. Please add at least 3 items to get outfit recommendations.`,
        );
      }

      // 2. Préparer les données pour Hugging Face
      const clothesData = userClothes.map((cloth) => {
        // Normaliser la catégorie
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

        // Normaliser la saison
        let season = cloth.season?.toLowerCase() || 'summer';
        const seasonMap: { [key: string]: string } = {
          'été': 'summer', 'ete': 'summer', 'hiver': 'winter',
          'automne': 'fall', 'printemps': 'spring',
          'all': 'all', 'toutes': 'all', 'toutes saisons': 'all', 'all seasons': 'all',
        };
        season = seasonMap[season] || season;

        // Normaliser le style
        let style = cloth.style?.toLowerCase().trim() || 'casual';
        if (style.includes('formal')) style = 'formal';
        else if (style.includes('sport')) style = 'sport';
        else if (style.includes('casual')) style = 'casual';
        else if (style.includes('elegant')) style = 'elegant';
        else if (style.includes('bohemian')) style = 'bohemian';
        else if (style.includes('vintage')) style = 'vintage';
        else if (style.includes('modern')) style = 'modern';
        else if (['robe', 'dress', 'tshirt', 'pantalon', 'shoes', 'top', 'bottom', 'footwear'].includes(style)) {
          style = 'casual';
        }

        const validStyles = ['casual', 'formal', 'sport', 'elegant', 'bohemian', 'vintage', 'modern'];
        if (!validStyles.includes(style)) {
          this.logger.warn(`   ⚠️ Style non reconnu: "${cloth.style}" → "casual"`);
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

      this.logger.log(`   📦 ${clothesData.length} vêtements préparés pour HF`);

      // 3. Vérifier qu'on a assez de vêtements par catégorie
      const byCategory = clothesData.reduce((acc, cloth) => {
        if (!acc[cloth.category]) acc[cloth.category] = [];
        acc[cloth.category].push(cloth);
        return acc;
      }, {} as Record<string, any[]>);

      const topsWithStyle = byCategory['top']?.filter(c => c.style === normalizedPreference).length || 0;
      const bottomsWithStyle = byCategory['bottom']?.filter(c => c.style === normalizedPreference).length || 0;
      const footwearWithStyle = byCategory['footwear']?.filter(c => c.style === normalizedPreference).length || 0;

      this.logger.log(`   📊 Vêtements avec style "${normalizedPreference}":`);
      this.logger.log(`      - Top: ${topsWithStyle}`);
      this.logger.log(`      - Bottom: ${bottomsWithStyle}`);
      this.logger.log(`      - Footwear: ${footwearWithStyle}`);

      if (!topsWithStyle || !bottomsWithStyle || !footwearWithStyle) {
        const missing: string[] = [];
        if (!topsWithStyle) missing.push('top');
        if (!bottomsWithStyle) missing.push('bottom');
        if (!footwearWithStyle) missing.push('pair of shoes');

        throw new BadRequestException(
          `Your wardrobe is missing items for the "${normalizedPreference}" style. Please add ${missing.join(', ')} to continue.`,
        );
      }

      // 4. ✅ CORRECTION : Tester plusieurs endpoints possibles
      const possibleEndpoints = [
        '/api/predict',    // Gradio 4.x+
        '/run/predict',    // Anciennes versions
        '/predict',        // Fallback
      ];

      let hfResult: any = null;
      let successEndpoint: string = '';

      for (const endpoint of possibleEndpoints) {
        try {
          const hfApiUrl = `${this.hfRecommenderUrl}${endpoint}`;
          this.logger.log(`📡 Tentative avec : ${hfApiUrl}`);

          const response = await firstValueFrom(
            this.httpService.post(hfApiUrl, {
              data: [
                JSON.stringify(clothesData), // Argument 1 : clothes_json
                normalizedPreference,        // Argument 2 : preference
                cityParam,                   // Argument 3 : city
              ],
            }, {
              timeout: 30000, // 30 secondes
              headers: {
                'Content-Type': 'application/json',
              },
            }),
          );

          // Si réponse OK, on utilise cet endpoint
          if (response.status === 200 && response.data) {
            hfResult = response.data?.data?.[0];
            successEndpoint = endpoint;
            this.logger.log(`✅ Succès avec l'endpoint : ${endpoint}`);
            break; // Sortir de la boucle
          }

        } catch (error: any) {
          this.logger.warn(`⚠️ Échec avec ${endpoint}: ${error.message}`);
          // Continuer avec le prochain endpoint
          continue;
        }
      }

      // 5. Vérifier si on a obtenu un résultat
      if (!hfResult) {
        throw new HttpException(
          'Unable to connect to the ML recommendation service. All endpoints failed.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // 6. Parser la réponse Gradio
      const recommendation = typeof hfResult === 'string' 
        ? JSON.parse(hfResult) 
        : hfResult;

      this.logger.log(`✅ Recommandation reçue via ${successEndpoint}`);

      // 7. Vérifier le succès
      if (!recommendation.success || !recommendation.outfit) {
        throw new BadRequestException(
          recommendation.message || 'Unable to generate recommendation',
        );
      }

      // 8. Récupérer les détails complets des vêtements depuis MongoDB
      const topId = recommendation.outfit.top;
      const bottomId = recommendation.outfit.bottom;
      const footwearId = recommendation.outfit.footwear;

      const [topCheck, bottomCheck, footwearCheck] = await Promise.all([
        this.clothesModel.findById(topId).exec(),
        this.clothesModel.findById(bottomId).exec(),
        this.clothesModel.findById(footwearId).exec(),
      ]);

      if (!topCheck || !bottomCheck || !footwearCheck) {
        throw new NotFoundException('Some recommended items were not found');
      }

      // ✅ Incrémenter le compteur SEULEMENT si succès
      this.logger.log(`✅ [Recommendations] Suggestion réussie - Incrémentation du compteur`);
      await this.subscriptionsService.incrementOutfitSuggestion(userId);

      // 9. Construire la réponse finale
      const response_final = {
        success: true,
        outfit: {
          top: this.formatClothResponse(topCheck),
          bottom: this.formatClothResponse(bottomCheck),
          footwear: this.formatClothResponse(footwearCheck),
        },
        metadata: {
          weather: recommendation.weather || {},
          season: recommendation.season,
          preference: preference,
          explanation: recommendation.explanation || {},
        },
        clothesIds: [
          (topCheck._id as Types.ObjectId).toString(),
          (bottomCheck._id as Types.ObjectId).toString(),
          (footwearCheck._id as Types.ObjectId).toString(),
        ],
      };

      this.logger.log(`   ✅ Recommandation terminée avec succès`);
      return response_final;

    } catch (error: any) {
      this.logger.error('❌ [Recommendations] Erreur:', error.message);
      
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException || 
          error instanceof ForbiddenException ||
          error instanceof HttpException) {
        throw error;
      }

      throw new BadRequestException(`Échec de la recommandation: ${error.message}`);
    }
  }

  private calculateScore(accepts: number, rejects: number): number {
    const total = accepts + rejects;
    if (total === 0) return 0;
    return (accepts - rejects) / total;
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