import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';
import { Store, StoreSchema } from './schemas/store.schema';
import { Clothes, ClothesSchema } from '../clothes/schemas/clothes.schema';
import { UserModule } from '../user/user.module';  // Import UserModule

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Store.name, schema: StoreSchema },
      { name: Clothes.name, schema: ClothesSchema },
    ]),
    forwardRef(() => UserModule),  // forwardRef pour gérer circularité
  ],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],  // Optionnel, si utilisé ailleurs
})
export class StoreModule {}