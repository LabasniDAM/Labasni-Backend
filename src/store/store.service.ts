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
import { forwardRef, Inject } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ConfirmPurchaseDto } from './dto/confirm-purchase.dto';
import { CartService } from '../cart/cart.service';
import { Order, OrderDocument } from '../orders/schemas/order.schema';

@Injectable()
export class StoreService {
  private stripe: Stripe;

  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>, 
    private configService: ConfigService,
    @Inject(forwardRef(() => UserService)) private userService: UserService,
    private subscriptionsService: SubscriptionsService,
    @Inject(forwardRef(() => CartService)) private cartService?: CartService, // ✨ NOUVEAU : Optionnel pour éviter dépendance circulaire
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

  private async verifyClothesOwnership(clothesId: Types.ObjectId, userId: string) {
    const clothes = await this.clothesModel.findOne({
      _id: clothesId,
      userId: new Types.ObjectId(userId),
    });

    if (!clothes) {
      throw new ForbiddenException('Ce vêtement ne vous appartient pas ou n\'existe pas');
    }
  }

  async create(dto: CreateStoreDto, userId: string): Promise<Store> {
    if (!this.isValidId(userId) || !this.isValidId(dto.clothesId.toString())) {
      throw new BadRequestException('Invalid ID format');
    }

    const quotaCheck = await this.subscriptionsService.canSellItem(userId);

    if (!quotaCheck.allowed) {
      throw new ForbiddenException(
        quotaCheck.message || 'Quota exceeded for store selling',
      );
    }

    await this.verifyClothesOwnership(dto.clothesId, userId);

    const storeItem = new this.storeModel({
      ...dto,
      userId: new Types.ObjectId(userId),
      condition: dto.condition || 'new', // Valeur par défaut si non fourni
    });

    const saved = await storeItem.save();
    await this.subscriptionsService.incrementItemSold(userId);

    return saved;
  }

  async findAll(): Promise<Store[]> {
    return this.storeModel
      .find()
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();
  }

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

  async update(id: string, dto: UpdateStoreDto, userId: string): Promise<Store> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid store item ID');
    }

    const item = await this.storeModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

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

  async createPaymentIntent(amount: number, currency?: string): Promise<string> {
    const finalCurrency = currency || this.configService.get<string>('STRIPE_CURRENCY', 'usd');
    
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
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

  async confirmPurchase(
    storeItemId: string,
    dto: ConfirmPurchaseDto,
    buyerId: string,
  ): Promise<Store> {
    // ✨ LOGS DE DEBUG : Vérifier le buyerId reçu
    console.log('🔍 [StoreService] confirmPurchase called');
    console.log('   📦 storeItemId:', storeItemId);
    console.log('   👤 buyerId:', buyerId);
    console.log('   💳 paymentMethod:', dto.paymentMethod);
    
    const item = await this.storeModel.findById(storeItemId).exec();
    
    if (!item) {
      throw new NotFoundException('Article non trouvé');
    }

    if (item.status === 'sold') {
      throw new BadRequestException('Cet article est déjà vendu');
    }

    const sellerId = item.userId.toString();

    if (sellerId === buyerId) {
      throw new BadRequestException('Vous ne pouvez pas acheter votre propre article');
    }

    // ✨ NOUVEAU : Récupérer toutes les informations AVANT de supprimer le dressing
    const clothes = await this.clothesModel.findById(item.clothesId).exec();
    const imageURL = clothes?.imageURL || '';
    const category = clothes?.category || '';
    const style = clothes?.style || '';
    const color = clothes?.color || '';
    const season = clothes?.season || '';

    const amountCents = Math.round(item.price * 100);

    // PAIEMENT PAR BALANCE
    if (dto.paymentMethod === 'balance') {
      if (dto.paymentIntentId) {
        throw new BadRequestException('paymentIntentId ne doit pas être fourni pour le paiement par balance');
      }

      // ✨ LOGS DE DEBUG : Vérifier avant findById
      console.log('💰 [StoreService] Processing balance payment');
      console.log('   🔍 buyerId before findById:', buyerId);
      console.log('   🔍 buyerId type:', typeof buyerId);
      console.log('   🔍 buyerId length:', buyerId?.length);
      
      const buyer = await this.userService.findById(buyerId);
      
      console.log('   👤 buyer found:', buyer ? 'YES' : 'NO');
      if (buyer) {
        console.log('   💰 buyer balance:', buyer.balance);
        console.log('   💰 amountCents:', amountCents);
      }
      
      if (!buyer || (buyer.balance || 0) < amountCents) {
        throw new BadRequestException('Solde insuffisant');
      }

      // ✨ CORRIGÉ : Utiliser buyer.id si disponible, sinon buyerId
      // buyer.id est garanti d'exister car il vient de findById qui le définit
      // IMPORTANT : Toujours convertir en string pour subtractFromBalance
      // buyer.id devrait déjà être une string grâce à findById qui le convertit
      let userIdToUse: string = String(buyer.id || buyerId);
      
      console.log('   🔍 buyerId (from param):', buyerId);
      console.log('   🔍 buyer.id:', buyer.id);
      console.log('   🔍 Using userIdToUse (string):', userIdToUse);
      console.log('   🔍 userIdToUse type:', typeof userIdToUse);
      console.log('   🔍 userIdToUse length:', userIdToUse.length);
      
      await this.userService.subtractFromBalance(userIdToUse, amountCents);
    }

    // PAIEMENT PAR STRIPE
    else if (dto.paymentMethod === 'stripe') {
      if (!dto.paymentIntentId) {
        throw new BadRequestException('paymentIntentId est requis pour Stripe');
      }

      const isDevelopment = this.configService.get<string>('NODE_ENV') === 'development';

      if (!isDevelopment) {
        const paymentIntent = await this.stripe.paymentIntents.retrieve(dto.paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
          throw new BadRequestException(`Paiement non réussi. Statut: ${paymentIntent.status}`);
        }

        if (paymentIntent.amount !== amountCents) {
          throw new BadRequestException('Montant du paiement incorrect');
        }
      } else {
        console.log('[DEV MODE] Stripe verification skipped');
      }
    } else {
      throw new BadRequestException('Méthode de paiement invalide');
    }

    // CRÉDIT VENDEUR
    await this.userService.addToBalance(sellerId, amountCents);

    // ✨ CRÉER LES ORDRES POUR L'ACHETEUR ET LE VENDEUR
    // Stocker toutes les informations importantes avant de supprimer le dressing
    try {
      // 1. Order pour l'acheteur (Purchased)
      const buyerOrder = new this.orderModel({
        clothesId: item.clothesId,
        userId: new Types.ObjectId(buyerId),
        price: item.price,
        orderDate: new Date(),
        imageURL: imageURL,
        category: category,
        style: style,
        color: color,
        season: season,
        size: item.size,
        orderType: 'Purchased', // ✨ NOUVEAU : Type explicite pour l'acheteur
      });

      await buyerOrder.save();
      console.log(`✅ Order created for buyer ${buyerId}, item ${storeItemId} with all details saved`);

      // 2. Order pour le vendeur (Sold) - ✨ NOUVEAU
      const sellerOrder = new this.orderModel({
        clothesId: item.clothesId,
        userId: new Types.ObjectId(sellerId), // ✨ userId = sellerId pour le vendeur
        price: item.price,
        orderDate: new Date(),
        imageURL: imageURL,
        category: category,
        style: style,
        color: color,
        season: season,
        size: item.size,
        orderType: 'Sold', // ✨ NOUVEAU : Type explicite pour le vendeur
      });

      await sellerOrder.save();
      console.log(`✅ Order created for seller ${sellerId}, item ${storeItemId} with all details saved`);
    } catch (error) {
      console.error('Failed to create order:', error);
      // Ne pas bloquer la transaction si la création d'ordre échoue
      // mais logger l'erreur pour investigation
    }

    // ✨ MODIFIÉ : Supprimer complètement l'article du Store (pas juste marquer comme sold)
    // Les paniers des autres utilisateurs garderont une référence mais l'article n'existera plus dans le Store
    const deletedItem = await this.storeModel
      .findByIdAndDelete(storeItemId)
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();

    if (!deletedItem) {
      throw new NotFoundException("Erreur lors de la suppression de l'article");
    }

    // ✨ MODIFIÉ : Supprimer l'article de tous les paniers (acheteur + autres utilisateurs)
    // Quand un article est acheté, il doit être retiré de tous les paniers
    try {
      if (this.cartService) {
        const removedCount = await this.cartService.removeItemFromAllCarts(storeItemId);
        console.log(`✅ Article retiré de ${removedCount} panier(s)`);
      }
    } catch (error) {
      // Ne pas bloquer la transaction si la mise à jour du panier échoue
      console.error('Erreur lors de la suppression de l\'article des paniers:', error);
    }

    // ✨ NOUVEAU : Supprimer l'article du dressing du vendeur (APRÈS avoir sauvegardé l'image dans Order)
    try {
      const clothesId = item.clothesId.toString();
      const deletedClothes = await this.clothesModel.findByIdAndDelete(clothesId).exec();
      if (deletedClothes) {
        console.log(`✅ Article supprimé du dressing du vendeur: ${clothesId} (vendeur: ${sellerId})`);
      } else {
        console.warn(`⚠️ Article non trouvé dans le dressing: ${clothesId}`);
      }
    } catch (error) {
      // Ne pas bloquer la transaction si la suppression du dressing échoue
      console.error('Erreur lors de la suppression de l\'article du dressing:', error);
    }

    // ✨ MODIFIÉ : Retourner l'article supprimé (pour compatibilité avec l'API)
    // Note: L'article n'existe plus dans le Store mais on retourne les données pour la réponse
    return deletedItem as any;
  }
}