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

  @Prop({ required: true, trim: true })
  size: string;

  @Prop({ enum: ['available', 'sold'], default: 'available' })
  status: 'available' | 'sold';

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  buyerId?: Types.ObjectId;  // Qui a acheté

  @Prop({ type: Date, required: false })
  soldAt?: Date;  // Quand l'achat a été fait

  @Prop({ type: String, required: false })
  stripePaymentIntentId?: string;  // Référence Stripe

  @Prop({ 
    type: String, 
    enum: ['stripe', 'balance'], 
    required: false 
  })
  paymentMethod?: 'stripe' | 'balance';

  @Prop({ 
    type: String, 
    enum: ['new', 'used', 'damaged'], 
    default: 'new',
    required: true 
  })
  condition: 'new' | 'used' | 'damaged';
}

export const StoreSchema = SchemaFactory.createForClass(Store);