import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'Clothes', required: true })
  clothesId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 0 })
  price: number;

  @Prop({ type: Date, default: Date.now })
  orderDate: Date;

  // ✨ NOUVEAU : Stocker toutes les informations importantes avant suppression du dressing
  @Prop({ type: String, required: false })
  imageURL?: string;

  @Prop({ type: String, required: false })
  category?: string; // Category du vêtement (ex: "top", "bottom", "shoes")

  @Prop({ type: String, required: false })
  style?: string; // Style (ex: "casual", "formal")

  @Prop({ type: String, required: false })
  color?: string; // Couleur

  @Prop({ type: String, required: false })
  season?: string; // Saison

  @Prop({ type: String, required: false })
  size?: string; // Taille de l'article vendu (depuis Store)

  // ✨ NOUVEAU : Type d'ordre pour distinguer explicitement les achats des ventes
  @Prop({ 
    type: String, 
    enum: ['Purchased', 'Sold'], 
    required: false,
    default: 'Purchased' // Par défaut pour compatibilité avec les anciens orders
  })
  orderType?: 'Purchased' | 'Sold'; // "Purchased" = achat, "Sold" = vente
}

export const OrderSchema = SchemaFactory.createForClass(Order);

