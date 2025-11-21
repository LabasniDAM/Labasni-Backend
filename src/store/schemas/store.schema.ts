import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StoreDocument = Store & Document;

@Schema({ timestamps: true })
export class Store {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Clothes', required: true })
  clothesId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  price: number;

  // AJOUT DU CHAMP SIZE
  @Prop({ required: true, trim: true })
  size: string;

  @Prop({ enum: ['available', 'sold'], default: 'available' })
  status: 'available' | 'sold';
}

export const StoreSchema = SchemaFactory.createForClass(Store);