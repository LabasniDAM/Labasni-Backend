import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios'; // ✅ NOUVEAU
import { ConfigModule } from '@nestjs/config'; // ✅ NOUVEAU
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { Clothes, ClothesSchema } from '../clothes/schemas/clothes.schema';
import { SubscriptionsModule } from 'src/subscriptions/subscriptions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clothes.name, schema: ClothesSchema },
    ]),
    SubscriptionsModule,
    HttpModule, // ✅ NOUVEAU : Pour appeler Hugging Face
    ConfigModule, // ✅ NOUVEAU : Pour accéder aux .env
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}