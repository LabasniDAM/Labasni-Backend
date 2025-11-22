import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from './schemas/store.schema';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Clothes, ClothesDocument } from '../clothes/schemas/clothes.schema';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { forwardRef, Inject } from '@nestjs/common';  // Pour forwardRef si cyclic
import { UserService } from '../user/user.service';  // Import UserService

@Injectable()
export class StoreService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
    private configService: ConfigService,
    @Inject(forwardRef(() => UserService)) private userService: UserService,  // Injecté avec forwardRef
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not found in config');
    }
this.stripe = new Stripe(this.configService.get<string>('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-11-17.clover',
});
  }

  private isValidId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  // Vérifie que le vêtement existe ET appartient à l'utilisateur
  private async verifyClothesOwnership(clothesId: Types.ObjectId, userId: string) {
    const clothes = await this.clothesModel.findOne({
      _id: clothesId,
      userId: new Types.ObjectId(userId),
    });

    if (!clothes) {
      throw new ForbiddenException('Ce vêtement ne vous appartient pas ou n\'existe pas');
    }
  }

  // CREATE
  async create(dto: CreateStoreDto, userId: string): Promise<Store> {
    if (!this.isValidId(userId) || !this.isValidId(dto.clothesId.toString())) {
      throw new BadRequestException('Invalid ID format');
    }

    await this.verifyClothesOwnership(dto.clothesId, userId);

    const storeItem = new this.storeModel({
      ...dto,
      userId: new Types.ObjectId(userId),
    });

    return await storeItem.save();
  }

  // FIND ALL
  async findAll(): Promise<Store[]> {
    return this.storeModel
      .find()
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();
  }

  // FIND BY USER ID
  async findByUserId(userId: string): Promise<Store[]> {
    if (!this.isValidId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    return this.storeModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();
  }

  // FIND ONE
  async findOne(id: string): Promise<Store> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid store item ID');
    }

    const item = await this.storeModel
      .findById(id)
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();

    if (!item) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

    return item;
  }

  // UPDATE
  async update(id: string, dto: UpdateStoreDto, userId: string): Promise<Store> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid store item ID');
    }

    const item = await this.storeModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

    // AJOUTEZ UN LOG POUR DEBUGGER
    console.log('item.userId:', item.userId.toString());
    console.log('userId:', userId);
    console.log('Comparison:', item.userId.toString() === userId);

    // Forcer la conversion en string des deux côtés
    if (item.userId.toString() !== userId.toString()) {
      throw new ForbiddenException('Vous ne pouvez pas modifier cet article');
    }

    if (dto.clothesId) {
      await this.verifyClothesOwnership(dto.clothesId, userId);
    }

    const updated = await this.storeModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
        dto,
        { new: true },
      )
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

    return updated;
  }

  // DELETE
  async remove(id: string, userId: string): Promise<void> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid store item ID');
    }

    const result = await this.storeModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId)
    }).exec();

    if (!result) {
      throw new NotFoundException(
        `Store item with ID ${id} not found or you don't have permission to delete it`
      );
    }
  }

  // Créer un payment intent
async createPaymentIntent(amount: number, currency?: string): Promise<string> {
  // Utiliser la currency du .env si non spécifiée
  const finalCurrency = currency || this.configService.get<string>('STRIPE_CURRENCY', 'usd');
  
  const paymentIntent = await this.stripe.paymentIntents.create({
    amount: Math.round(amount * 100),  // Convertir en centimes
    currency: finalCurrency,
    payment_method_types: ['card'],
    metadata: {
      integration: 'labasni-store',
    },
  });
  
  if (!paymentIntent.client_secret) {
    throw new BadRequestException('Failed to create client secret');
  }
  
  return paymentIntent.client_secret;
}

// Confirmer paiement et update balance
async confirmPurchase(storeItemId: string, paymentIntentId: string, buyerId: string): Promise<Store> {
  // Vérifier que l'item existe (SANS .populate() pour éviter le problème)
  const item = await this.storeModel.findById(storeItemId).exec();
  
  if (!item) {
    throw new NotFoundException('Store item not found');
  }

  // Vérifier que l'item est disponible
  if (item.status === 'sold') {
    throw new BadRequestException('This item is already sold');
  }

  // ✅ CORRECTION : Extraire l'ID proprement
  const sellerId = item.userId.toString();  // Convertir ObjectId en string

  // Empêcher l'achat de son propre article
  if (sellerId === buyerId) {
    throw new BadRequestException('You cannot buy your own item');
  }

  // Vérifier le payment intent sur Stripe
  const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';
  
  if (!isDevelopment) {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException(
        `Payment not succeeded. Current status: ${paymentIntent.status}`
      );
    }

    const expectedAmount = Math.round(item.price * 100);
    if (paymentIntent.amount !== expectedAmount) {
      throw new BadRequestException('Payment amount mismatch');
    }
  } else {
    console.log(`[DEV MODE] Skipping Stripe verification for payment: ${paymentIntentId}`);
    console.log(`[DEV MODE] Item price: ${item.price}, Seller ID: ${sellerId}`);  // ✅ Afficher juste l'ID
  }

  // ✅ CORRECTION : Passer le string ID, pas l'objet
  await this.userService.addToBalance(sellerId, item.price);

  // Marquer l'item comme vendu
  const updatedItem = await this.storeModel
    .findByIdAndUpdate(
      storeItemId,
      { 
        status: 'sold',
        soldAt: new Date(), 
        buyerId: new Types.ObjectId(buyerId),
        stripePaymentIntentId: paymentIntentId,  // ✅ Sauvegarder la référence Stripe
      },
      { new: true }
    )
    .populate('userId', '-password -__v')
    .populate('clothesId')
    .exec();

  if (!updatedItem) {
    throw new NotFoundException('Failed to update store item');
  }

  return updatedItem;
}
}