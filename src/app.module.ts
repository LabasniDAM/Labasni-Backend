// src/app.module.ts
import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { ClothesModule } from './clothes/clothes.module';
import { OutfitsModule } from './outfits/outfits.module';
import { StoreModule } from './store/store.module';
import { AvatarsModule } from './avatars/avatars.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { OrdersModule } from './orders/orders.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { CartModule } from './cart/cart.module';
import Joi from 'joi';
// ✨ NOUVEAUX IMPORTS
import { ScheduleModule } from '@nestjs/schedule';
import * as cron from 'node-cron';
import { ClothesService } from './clothes/clothes.service';
import { AIEngineModule } from './ai-engine/ai-engine.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        MONGODB_URI: Joi.string(),
        MONGO_URI: Joi.string(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('1h'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
        GOOGLE_CLIENT_ID: Joi.string().required(),
        GOOGLE_CLIENT_SECRET: Joi.string().required(),
        GOOGLE_CALLBACK_URL: Joi.string().required(),

        // EMAIL (Brevo)
        BREVO_API_KEY: Joi.string().required(),
        EMAIL_FROM: Joi.string().optional().default('Labasni <noreply@labasni.com>'),
        EMAIL_FROM_ADDRESS: Joi.string().email().optional(),
        
        // Les anciennes variables SMTP sont maintenant optionnelles (pour compatibilité)
        EMAIL_HOST: Joi.string().optional(),
        EMAIL_PORT: Joi.number().optional(),
        EMAIL_USER: Joi.string().email().optional(),
        EMAIL_PASS: Joi.string().optional(),

        // TWILIO
        TWILIO_ACCOUNT_SID: Joi.string().required(),
        TWILIO_AUTH_TOKEN: Joi.string().required(),
        TWILIO_PHONE_NUMBER: Joi.string().required(),

        // CLOUDINARY
        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        CLOUDINARY_API_KEY: Joi.string().required(),
        CLOUDINARY_API_SECRET: Joi.string().required(),

        // GEMINI AI (optionnel - fallback regex si non configuré)
        GEMINI_API_KEY: Joi.string().optional(),
      }),
      validationOptions: {
        abortEarly: false,
      },
    }),

    MongooseModule.forRoot(
      process.env.MONGODB_URI ??
        process.env.MONGO_URI ??
        'mongodb://127.0.0.1:27017/labasni',
    ),

    // ✨ NOUVEAU : Active le système de scheduling
    ScheduleModule.forRoot(),

    UserModule,
    AuthModule,
    ClothesModule,
    OutfitsModule,
    StoreModule,
    AvatarsModule,
    CloudinaryModule,
    ChatModule,
    SubscriptionsModule,
    OrdersModule,
    RecommendationsModule,
    CartModule,
    AIEngineModule, 
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule, OnModuleInit {
  constructor(private clothesService: ClothesService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }

  // ✨ NOUVEAU : Cron job pour vérifier si fine-tuning nécessaire
  onModuleInit() {
    // Chaque dimanche à minuit (00:00)
    cron.schedule('0 0 * * 0', async () => {
      try {
        const stats = await this.clothesService.getGlobalCorrectionStats();

        console.log('═══════════════════════════════════════');
        console.log('🔍 VÉRIFICATION HEBDOMADAIRE FINE-TUNING');
        console.log('═══════════════════════════════════════');
        console.log(`📊 Total corrections: ${stats.totalCorrections}`);
        console.log(`👥 Utilisateurs contributeurs: ${stats.uniqueUsers}`);
        console.log(`🎯 Objectif: 50 corrections`);
        console.log(`📈 Progression: ${stats.progress.percentage.toFixed(1)}%`);

        if (stats.readyForFineTuning) {
          console.log('\n✅ PRÊT POUR LE FINE-TUNING !');
          console.log('🔥 Action recommandée : Lancer le fine-tuning sur Colab');
          console.log(`📁 Endpoint d'export: GET /cloth/corrections`);

          // Si tu veux des paliers (tous les 50, 100, 150...)
          if (stats.totalCorrections % 50 === 0) {
            console.log(`\n🎉 PALIER ATTEINT : ${stats.totalCorrections} corrections`);
            console.log('💡 Suggestion : Re-fine-tune pour améliorer le modèle');
          }
        } else {
          const remaining = 50 - stats.totalCorrections;
          console.log(`\n⏳ Pas encore prêt. Il manque ${remaining} corrections.`);
        }

        console.log('═══════════════════════════════════════\n');
      } catch (error) {
        console.error('❌ Erreur lors de la vérification:', error);
      }
    });

    console.log('✅ Cron job activé : Vérification fine-tuning chaque dimanche à minuit');
  }
}