// src/ai-engine/ai-engine.module.ts
// ✅ SOLUTION FINALE : Utiliser la même constante JWT_SECRET que AuthModule

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AIEngineService } from './ai-engine.service';
import { LiveGateway } from './live.gateway';
import { ClothesModule } from '../clothes/clothes.module';
import { Clothes, ClothesSchema } from '../clothes/schemas/clothes.schema';
import { JWT_SECRET } from '../auth/auth.constants'; // ✅ IMPORTER LA MÊME CONSTANTE

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Clothes.name, schema: ClothesSchema },
    ]),
    ClothesModule,
    // ✅ CORRECTION : Utiliser EXACTEMENT le même secret que AuthModule
    JwtModule.register({
      secret: JWT_SECRET,  // ← Même valeur que JwtStrategy
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AIEngineService, LiveGateway],
  exports: [AIEngineService, LiveGateway],
})
export class AIEngineModule {}