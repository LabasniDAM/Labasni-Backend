import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClothesDocument = Clothes & Document;

@Schema({ timestamps: true })
export class Clothes {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  imageURL: string;

  // Tableau de catégories (haut, bas, pantalon, chaussures, etc.)
  @Prop({  required: true })
  category: string;

  // Saison
  @Prop()
  season: string;

  // Couleur
  @Prop()
  color: string;

  // Style
  @Prop()
  style: string;

  @Prop({ default: 0 })
  acceptedCount: number;

  @Prop({ default: 0 })
  rejectedCount: number;
}

export const ClothesSchema = SchemaFactory.createForClass(Clothes);
