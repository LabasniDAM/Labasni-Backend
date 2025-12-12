import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios'; // ✅ NOUVEAU
import { ConfigModule } from '@nestjs/config'; // ✅ NOUVEAU
import { AIEngineService } from './ai-engine.service';
import { LiveGateway } from './live.gateway';
import { ClothesModule } from '../clothes/clothes.module';
import { Clothes, ClothesSchema } from '../clothes/schemas/clothes.schema';
import { JWT_SECRET } from '../auth/auth.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clothes.name, schema: ClothesSchema },
    ]),
    ClothesModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
    HttpModule, // ✅ NOUVEAU : Pour appeler Hugging Face
    ConfigModule, // ✅ NOUVEAU : Pour accéder aux .env
  ],
  providers: [AIEngineService, LiveGateway],
  exports: [AIEngineService, LiveGateway],
})
export class AIEngineModule {}