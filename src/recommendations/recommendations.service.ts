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
import { ConfigService } from '@nestjs/config';
import { Clothes, ClothesDocument } from 'src/clothes/schemas/clothes.schema';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { Client } from '@gradio/client';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly hfRecommenderUrl: string;

  constructor(
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
    private subscriptionsService: SubscriptionsService,
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

      // 4. ✅ APPEL HUGGING FACE via Gradio Client
      const hfResult = await this.callHuggingFaceAPI(
        clothesData,
        normalizedPreference,
        cityParam,
      );

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
   * ✅ Appel Hugging Face via Gradio Client (même protocole que le test Python)
   */
  private async callHuggingFaceAPI(
    clothesData: any[],
    preference: string,
    city: string,
  ): Promise<any> {
    this.logger.log(`📡 Connecting to Gradio Space...`);
    
    try {
      // ✅ Extraire le Space ID depuis l'URL
      // https://syleto-recommender.hf.space → Syleto/recommender
      const spaceId = this.hfRecommenderUrl
        .replace('https://', '')
        .replace('.hf.space', '')
        .replace('syleto-recommender', 'Syleto/recommender');
      
      this.logger.log(`   Space ID: ${spaceId}`);
      
      // ✅ Connexion au Space (même méthode que Python)
      const client = await Client.connect(spaceId);
      this.logger.log(`✅ Connected to Gradio Space`);
      
      // ✅ Préparer les données (format identique au test Python)
      const clothesJson = JSON.stringify(clothesData);
      
      this.logger.log(`   Calling predict with ${clothesData.length} items...`);
      this.logger.debug(`   Preference: ${preference}, City: ${city}`);
      
      // ✅ Appel de la fonction predict (même signature que Python)
      const result = await client.predict('/predict', {
        clothes_json: clothesJson,
        preference: preference,
        city: city,
      });
      
      this.logger.log(`✅ Prediction received from Gradio`);
      
      // ✅ Parser le résultat
      if (result && result.data) {
        // Le résultat peut être directement dans data ou data[0]
        const resultData = Array.isArray(result.data) ? result.data[0] : result.data;
        
        // Si c'est une string JSON, la parser
        const parsed = typeof resultData === 'string' 
          ? JSON.parse(resultData) 
          : resultData;
        
        this.logger.log(`   Success: ${parsed.success}`);
        
        if (parsed.weather) {
          this.logger.log(`   Météo: ${parsed.weather.temperature}°C, ${parsed.weather.condition}`);
        }
        
        if (parsed.season) {
          this.logger.log(`   Saison: ${parsed.season}`);
        }
        
        return parsed;
      }
      
      throw new Error('Invalid response format from Gradio');
      
    } catch (error: any) {
      this.logger.error(`❌ Gradio Client Error: ${error.message}`);
      
      // Erreurs de connexion
      if (error.message.includes('Connection') || error.message.includes('connect')) {
        throw new HttpException(
          'Cannot connect to ML service. Please verify the Space is Running on Hugging Face.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      // Erreur de Space ID
      if (error.message.includes('Space') || error.message.includes('not found')) {
        throw new HttpException(
          `ML Space not found. Please verify HF_RECOMMENDER_URL is correct: ${this.hfRecommenderUrl}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      // Erreur d'API
      if (error.message.includes('predict')) {
        throw new HttpException(
          'ML prediction failed. The Space may be starting up. Please try again in a few seconds.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      
      // Autres erreurs
      throw new HttpException(
        `ML service error: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
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