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

        let season = cloth.season?.toLowerCase() || 'summer';
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
          `Missing items for "${normalizedPreference}" style: ${missing.join(', ')}`,
        );
      }

      // 4. ✅ CORRECTION : Utiliser le bon endpoint Gradio 6.x
      const possibleEndpoints = [
        '/call/predict',   // ✅ Gradio 6.x (NOUVEAU)
        '/api/predict',    // Gradio 4.x-5.x
        '/run/predict',    // Anciennes versions
      ];

      let hfResult: any = null;
      let successEndpoint: string = '';
      let eventId: string | null = null;

      for (const endpoint of possibleEndpoints) {
        try {
          const hfApiUrl = `${this.hfRecommenderUrl}${endpoint}`;
          this.logger.log(`📡 Tentative avec : ${hfApiUrl}`);

          // ✅ Pour Gradio 6.x avec /call/predict, c'est un processus en 2 étapes
          if (endpoint === '/call/predict') {
            // Étape 1 : Initier l'appel
            const initiateResponse = await firstValueFrom(
              this.httpService.post(hfApiUrl, {
                data: [
                  JSON.stringify(clothesData),
                  normalizedPreference,
                  cityParam,
                ],
              }, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' },
              }),
            );

            // Récupérer l'event_id
            eventId = initiateResponse.data?.event_id;
            
            if (!eventId) {
              this.logger.warn(`⚠️ Pas d'event_id reçu pour ${endpoint}`);
              continue;
            }

            this.logger.log(`   🔑 Event ID reçu : ${eventId}`);

            // Étape 2 : Récupérer le résultat
            const resultUrl = `${this.hfRecommenderUrl}/call/predict/${eventId}`;
            this.logger.log(`   📥 Récupération du résultat : ${resultUrl}`);

            // Attendre le résultat (avec retry)
            let attempts = 0;
            const maxAttempts = 10;
            
            while (attempts < maxAttempts) {
              try {
                const resultResponse = await firstValueFrom(
                  this.httpService.get(resultUrl, {
                    timeout: 3000,
                  }),
                );

                // Gradio 6.x retourne un stream d'événements SSE
                const lines = resultResponse.data.split('\n');
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.substring(6));
                    
                    if (data.msg === 'process_completed' && data.output?.data) {
                      hfResult = data.output.data[0];
                      successEndpoint = endpoint;
                      this.logger.log(`✅ Succès avec ${endpoint}`);
                      break;
                    }
                  }
                }

                if (hfResult) break;
                
                // Attendre 500ms avant le prochain essai
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
                
              } catch (pollError: any) {
                this.logger.warn(`   ⏳ Attente résultat (tentative ${attempts + 1}/${maxAttempts})`);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            if (hfResult) break;

          } else {
            // Pour les anciens endpoints
            const response = await firstValueFrom(
              this.httpService.post(hfApiUrl, {
                data: [
                  JSON.stringify(clothesData),
                  normalizedPreference,
                  cityParam,
                ],
              }, {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' },
              }),
            );

            if (response.status === 200 && response.data) {
              hfResult = response.data?.data?.[0];
              successEndpoint = endpoint;
              this.logger.log(`✅ Succès avec ${endpoint}`);
              break;
            }
          }

        } catch (error: any) {
          this.logger.warn(`⚠️ Échec avec ${endpoint}: ${error.message}`);
          continue;
        }
      }

      // 5. Vérifier le résultat
      if (!hfResult) {
        throw new HttpException(
          'Unable to connect to ML service. All endpoints failed.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // 6. Parser la réponse
      const recommendation = typeof hfResult === 'string' 
        ? JSON.parse(hfResult) 
        : hfResult;

      this.logger.log(`✅ Recommandation reçue via ${successEndpoint}`);

      if (!recommendation.success || !recommendation.outfit) {
        throw new BadRequestException(
          recommendation.message || 'Unable to generate recommendation',
        );
      }

      // 7. Récupérer les détails complets
      const [topCheck, bottomCheck, footwearCheck] = await Promise.all([
        this.clothesModel.findById(recommendation.outfit.top).exec(),
        this.clothesModel.findById(recommendation.outfit.bottom).exec(),
        this.clothesModel.findById(recommendation.outfit.footwear).exec(),
      ]);

      if (!topCheck || !bottomCheck || !footwearCheck) {
        throw new NotFoundException('Some recommended items were not found');
      }

      // 8. Incrémenter le compteur
      this.logger.log(`✅ [Recommendations] Incrémentation du compteur`);
      await this.subscriptionsService.incrementOutfitSuggestion(userId);

      // 9. Construire la réponse
      return {
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

    } catch (error: any) {
      this.logger.error('❌ [Recommendations] Erreur:', error.message);
      
      if (error instanceof BadRequestException || 
          error instanceof NotFoundException || 
          error instanceof ForbiddenException ||
          error instanceof HttpException) {
        throw error;
      }

      throw new BadRequestException(`Échec: ${error.message}`);
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