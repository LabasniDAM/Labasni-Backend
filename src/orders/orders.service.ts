import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { Store, StoreDocument } from '../store/schemas/store.schema';
import { Clothes, ClothesDocument } from '../clothes/schemas/clothes.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
  ) {}

  /**
   * Créer une nouvelle commande
   */
  async create(userId: string, createOrderDto: CreateOrderDto): Promise<Order> {
    const order = new this.orderModel({
      clothesId: new Types.ObjectId(createOrderDto.clothesId),
      userId: new Types.ObjectId(userId),
      price: createOrderDto.price,
      orderDate: new Date(),
    });

    return await order.save();
  }

  /**
   * ✨ NOUVEAU : Helper pour enrichir les orders avec les données stockées
   */
  private enrichOrderWithStoredData(order: any): any {
    // ✨ CORRIGÉ : S'assurer que clothesId a toujours un _id valide (string)
    // Si populate a échoué, order.clothesId devrait déjà être créé dans findAll()
    // Mais on vérifie quand même pour robustesse
    
    if (!order.clothesId || !order.clothesId._id) {
      // Si Clothes a été supprimé (populate a retourné null), créer un objet clothesId avec les données stockées dans Order
      // L'ID devrait déjà être défini dans findAll(), mais on le vérifie
      const clothesIdString = order.clothesId?._id?.toString() || 
                              (typeof order.clothesId === 'string' ? order.clothesId : '') ||
                              '';
      
      order.clothesId = {
        _id: clothesIdString || 'unknown', // ✨ CORRIGÉ : Toujours avoir un _id, même si c'est 'unknown'
        name: order.category || 'Article supprimé', // Utiliser category comme nom
        category: order.category || 'unknown',
        imageURL: order.imageURL || '', // ✨ Image stockée
        style: order.style || '',
        color: order.color || '',
        season: order.season || '',
      };
    } else {
      // Si Clothes existe, compléter avec les données de Order si manquantes
      // ✨ CORRIGÉ : S'assurer que _id est toujours une string
      if (order.clothesId._id && typeof order.clothesId._id !== 'string') {
        order.clothesId._id = order.clothesId._id.toString();
      }
      
      // S'assurer que _id n'est pas vide
      if (!order.clothesId._id || order.clothesId._id === '') {
        order.clothesId._id = 'unknown';
      }
      
      if (!order.clothesId.imageURL && order.imageURL) {
        order.clothesId.imageURL = order.imageURL;
      }
      if (!order.clothesId.category && order.category) {
        order.clothesId.category = order.category;
      }
      if (!order.clothesId.style && order.style) {
        order.clothesId.style = order.style;
      }
      if (!order.clothesId.color && order.color) {
        order.clothesId.color = order.color;
      }
      if (!order.clothesId.season && order.season) {
        order.clothesId.season = order.season;
      }
    }
    // ✨ NOUVEAU : Ajouter la taille depuis Order
    if (order.size) {
      order.size = order.size;
    }
    // ✨ NOUVEAU : Préserver orderType
    if (order.orderType) {
      order.orderType = order.orderType;
    }
    return order;
  }

  /**
   * Récupérer toutes les commandes de l'utilisateur
   */
  async findAll(userId: string): Promise<Order[]> {
    // ✨ CORRIGÉ : Récupérer d'abord les orders sans populate pour garder les ObjectIds
    // Puis populate, et si populate échoue, utiliser les données stockées dans Order
    const rawOrders = await this.orderModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    // Stocker les ObjectIds avant populate
    const orderMap = new Map<string, any>();
    rawOrders.forEach((order: any) => {
      orderMap.set(order._id.toString(), {
        clothesIdObjectId: order.clothesId?.toString() || order.clothesId,
        ...order,
      });
    });

    // Maintenant populate pour obtenir les données complètes
    const orders = await this.orderModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('clothesId', 'name category imageURL style color season')
      .populate('userId', 'fullName email')
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    // ✨ MODIFIÉ : Enrichir avec les données stockées dans Order
    return orders.map((order: any) => {
      // Si populate a échoué (clothes supprimé), order.clothesId sera null
      // Utiliser l'ObjectId stocké depuis la première requête
      if (!order.clothesId || !order.clothesId._id) {
        const rawOrder = orderMap.get(order._id.toString());
        if (rawOrder && rawOrder.clothesIdObjectId) {
          // Créer un objet clothesId avec les données stockées dans Order
          order.clothesId = {
            _id: rawOrder.clothesIdObjectId,
            name: order.category || 'Article supprimé',
            category: order.category || 'unknown',
            imageURL: order.imageURL || '',
            style: order.style || '',
            color: order.color || '',
            season: order.season || '',
          };
        }
      }
      return this.enrichOrderWithStoredData(order);
    });
  }

  /**
   * Récupérer toutes les commandes (admin)
   */
  async findAllAdmin(): Promise<Order[]> {
    const orders = await this.orderModel
      .find()
      .populate('clothesId', 'name category imageURL style color season')
      .populate('userId', 'fullName email')
      .sort({ orderDate: -1 })
      .exec();

    // ✨ MODIFIÉ : Enrichir avec les données stockées dans Order
    return orders.map((order: any) => this.enrichOrderWithStoredData(order));
  }

  /**
   * Récupérer l'historique des transactions (montants envoyés/reçus)
   * ✨ IMPORTANT : Cette fonction retourne UNIQUEMENT des transactions (pas d'orders)
   * Les transactions ont: _id, type, amount, description, date, paymentMethod, createdAt
   * Les transactions N'ONT PAS: clothesId, userId (comme objets)
   */
  async getTransactionsHistory(userId: string): Promise<any[]> {
    const transactions: any[] = [];

    // 1. Transactions sortantes : Achats (Orders où userId = userId)
    // ✨ CRITIQUE : Utiliser .lean() pour obtenir des objets JavaScript simples (pas de documents Mongoose)
    const purchases = await this.orderModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id price orderDate createdAt') // ✨ Sélectionner UNIQUEMENT les champs nécessaires
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    purchases.forEach((order: any) => {
      // ✨ CRITIQUE : Créer UNIQUEMENT un objet transaction, sans aucun champ d'order
      // Utiliser Object.assign ou créer un nouvel objet pour éviter toute propriété cachée
      const transaction: any = {};
      transaction._id = order._id.toString();
      transaction.type = 'outgoing'; // ✨ OBLIGATOIRE : type doit être "incoming" ou "outgoing"
      transaction.amount = order.price;
      transaction.description = 'Achat de vêtement';
      transaction.date = order.orderDate || order.createdAt;
      transaction.paymentMethod = 'balance'; // Par défaut, peut être amélioré
      transaction.createdAt = order.createdAt;
      // ✨ GARANTI : Aucun champ d'order (clothesId, userId, price, orderDate, etc.)
      transactions.push(transaction);
    });

    // 2. Transactions entrantes : Ventes (Store items vendus où userId = sellerId)
    // Note: Les items vendus sont supprimés, donc on doit utiliser les Orders pour retrouver les ventes
    // On cherche les Orders où le vendeur est l'utilisateur actuel
    // Pour cela, on doit trouver les Orders liés aux vêtements de l'utilisateur
    
    // Alternative : Utiliser les Orders avec populate pour trouver les vendeurs
    // Pour l'instant, on utilise une approche simple basée sur les Store items vendus
    
    // 2. Transactions entrantes : Ventes
    // Trouver tous les vêtements de l'utilisateur
    const userClothes = await this.clothesModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id')
      .exec();

    const userClothesIds = userClothes.map((cloth: any) => cloth._id);

    // Trouver les Orders qui contiennent ces vêtements (ce sont les ventes)
    // ✨ CRITIQUE : Utiliser .lean() et .select() pour obtenir UNIQUEMENT les champs nécessaires
    const sales = await this.orderModel
      .find({ clothesId: { $in: userClothesIds } })
      .select('_id userId price orderDate createdAt') // ✨ Sélectionner UNIQUEMENT les champs nécessaires
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    sales.forEach((order: any) => {
      // ✨ CORRIGÉ : S'assurer que ce n'est pas un achat de l'utilisateur (déjà ajouté)
      // Comparer les IDs de manière robuste (gérer ObjectId et string)
      const orderUserId = order.userId?.toString() || (order.userId as any)?._id?.toString() || order.userId;
      const currentUserId = userId.toString();
      
      if (orderUserId !== currentUserId) {
        // ✨ CRITIQUE : Créer UNIQUEMENT un objet transaction, sans aucun champ d'order
        // Utiliser Object.assign ou créer un nouvel objet pour éviter toute propriété cachée
        const transaction: any = {};
        transaction._id = `sale_${order._id.toString()}`;
        transaction.type = 'incoming'; // ✨ OBLIGATOIRE : type doit être "incoming" ou "outgoing"
        transaction.amount = order.price;
        transaction.description = 'Vente de vêtement';
        transaction.date = order.orderDate || order.createdAt;
        transaction.paymentMethod = 'balance';
        transaction.createdAt = order.createdAt;
        // ✨ GARANTI : Aucun champ d'order (clothesId, userId, price, orderDate, etc.)
        transactions.push(transaction);
      }
    });

    // 3. Top-ups : À implémenter si vous avez une collection dédiée
    // Pour l'instant, on peut ajouter ça plus tard

    // Trier par date (plus récent en premier)
    const sortedTransactions = transactions.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt).getTime();
      const dateB = new Date(b.date || b.createdAt).getTime();
      return dateB - dateA;
    });

    // ✨ VALIDATION FINALE CRITIQUE : S'assurer qu'aucune transaction n'a de champs d'order
    // Filtrer et nettoyer pour garantir qu'on retourne UNIQUEMENT des transactions
    const cleanedTransactions = sortedTransactions.map((transaction: any) => {
      // ✨ CRITIQUE : Créer un nouvel objet avec UNIQUEMENT les champs de transaction
      // Utiliser Object.create(null) pour créer un objet sans prototype, puis ajouter uniquement les champs nécessaires
      const cleanTransaction: any = Object.create(null);
      cleanTransaction._id = String(transaction._id || '');
      cleanTransaction.type = String(transaction.type || ''); // OBLIGATOIRE : "incoming" ou "outgoing"
      cleanTransaction.amount = Number(transaction.amount || 0);
      cleanTransaction.description = String(transaction.description || '');
      cleanTransaction.date = transaction.date || transaction.createdAt || new Date();
      cleanTransaction.paymentMethod = transaction.paymentMethod ? String(transaction.paymentMethod) : 'balance';
      cleanTransaction.createdAt = transaction.createdAt || transaction.date || new Date();
      // ✨ GARANTI : Aucun champ d'order (clothesId, userId, price, orderDate, etc.)
      return cleanTransaction;
    });

    // ✨ VALIDATION : Vérifier qu'aucune transaction n'a de champs d'order
    const invalidTransactions = cleanedTransactions.filter((t: any) => {
      return t.clothesId !== undefined || 
             t.userId !== undefined || 
             t.price !== undefined || 
             t.orderDate !== undefined ||
             !t.type || 
             (t.type !== 'incoming' && t.type !== 'outgoing');
    });

    if (invalidTransactions.length > 0) {
      console.error('🚨 [OrdersService] CRITICAL: Found invalid transactions with order fields!', invalidTransactions);
      // Filtrer les transactions invalides
      return cleanedTransactions.filter((t: any) => {
        return !t.clothesId && 
               !t.userId && 
               !t.price && 
               !t.orderDate &&
               t.type && 
               (t.type === 'incoming' || t.type === 'outgoing');
      });
    }

    return cleanedTransactions;
  }

  /**
   * ✨ NOUVEAU : Récupérer l'historique unifié (achats + ventes) avec tags
   * Retourne tous les vêtements (achetés ou vendus) avec un tag "Purchased" ou "Sold"
   */
  async getUnifiedHistory(userId: string): Promise<any[]> {
    const history: any[] = [];

    // ✨ ÉTAPE 1 : Récupérer tous les vêtements de l'utilisateur (pour distinguer achats/ventes)
    const userClothes = await this.clothesModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id')
      .lean()
      .exec();

    const userClothesIds = userClothes.map((cloth: any) => cloth._id);

    // ✨ ÉTAPE 2 : Achats = Orders où userId = userId ET orderType = 'Purchased' (ou null/undefined pour compatibilité)
    const rawPurchases = await this.orderModel
      .find({ 
        userId: new Types.ObjectId(userId),
        $or: [
          { orderType: 'Purchased' },
          { orderType: { $exists: false } }, // Compatibilité avec les anciens orders
          { orderType: null }
        ]
      })
      .select('_id clothesId userId price orderDate createdAt imageURL category style color season size orderType')
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    // Stocker les ObjectIds avant populate
    const purchaseMap = new Map<string, any>();
    rawPurchases.forEach((order: any) => {
      purchaseMap.set(order._id.toString(), {
        clothesIdObjectId: order.clothesId?.toString() || order.clothesId,
        ...order,
      });
    });

    // Populate pour obtenir les données complètes
    const purchases = await this.orderModel
      .find({ 
        userId: new Types.ObjectId(userId),
        $or: [
          { orderType: 'Purchased' },
          { orderType: { $exists: false } }, // Compatibilité avec les anciens orders
          { orderType: null }
        ]
      })
      .populate('clothesId', 'name category imageURL style color season')
      .populate('userId', 'fullName email')
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    purchases.forEach((order: any) => {
      // Si populate a échoué, utiliser les données stockées
      if (!order.clothesId || !order.clothesId._id) {
        const rawOrder = purchaseMap.get(order._id.toString());
        if (rawOrder && rawOrder.clothesIdObjectId) {
          order.clothesId = {
            _id: rawOrder.clothesIdObjectId,
            name: order.category || 'Article supprimé',
            category: order.category || 'unknown',
            imageURL: order.imageURL || '',
            style: order.style || '',
            color: order.color || '',
            season: order.season || '',
          };
        }
      }

      // Enrichir avec les données stockées
      const enrichedOrder = this.enrichOrderWithStoredData(order);

      // Créer un objet d'historique unifié
      const historyItem: any = Object.create(null);
      historyItem._id = enrichedOrder._id.toString();
      // ✨ Utiliser orderType du Order (ou 'Purchased' par défaut pour compatibilité)
      historyItem.type = enrichedOrder.orderType || 'Purchased';
      historyItem.clothesId = {
        _id: enrichedOrder.clothesId._id || enrichedOrder.clothesId.id || '',
        name: enrichedOrder.clothesId.name || enrichedOrder.category || 'Article',
        category: enrichedOrder.clothesId.category || enrichedOrder.category || 'unknown',
        imageURL: enrichedOrder.clothesId.imageURL || enrichedOrder.imageURL || '',
        style: enrichedOrder.clothesId.style || enrichedOrder.style || '',
        color: enrichedOrder.clothesId.color || enrichedOrder.color || '',
        season: enrichedOrder.clothesId.season || enrichedOrder.season || '',
      };
      historyItem.price = Math.abs(enrichedOrder.price); // ✨ Prix absolu (couleur rouge côté frontend)
      historyItem.date = enrichedOrder.orderDate || enrichedOrder.createdAt;
      historyItem.createdAt = enrichedOrder.createdAt;
      historyItem.size = enrichedOrder.size;

      history.push(historyItem);
    });

    // ✨ ÉTAPE 3 : Ventes = Orders où userId = userId ET orderType = 'Sold'
    const rawSales = await this.orderModel
      .find({ 
        userId: new Types.ObjectId(userId),
        orderType: 'Sold' // ✨ CRITIQUE : Utiliser le champ orderType explicite
      })
      .select('_id clothesId userId price orderDate createdAt imageURL category style color season size orderType')
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    // Stocker les ObjectIds avant populate
    const saleMap = new Map<string, any>();
    rawSales.forEach((order: any) => {
      saleMap.set(order._id.toString(), {
        clothesIdObjectId: order.clothesId?.toString() || order.clothesId,
        ...order,
      });
    });

    // Populate pour obtenir les données complètes
    const sales = await this.orderModel
      .find({ 
        userId: new Types.ObjectId(userId),
        orderType: 'Sold' // ✨ CRITIQUE : Utiliser le champ orderType explicite
      })
      .populate('clothesId', 'name category imageURL style color season')
      .populate('userId', 'fullName email')
      .sort({ orderDate: -1 })
      .lean()
      .exec();

    sales.forEach((order: any) => {
      // ✨ MODIFIÉ : Plus besoin de vérifier orderUserId !== currentUserId
      // car on cherche directement les Orders où userId = userId (vendeur)
      // Si populate a échoué, utiliser les données stockées
      if (!order.clothesId || !order.clothesId._id) {
        const rawOrder = saleMap.get(order._id.toString());
        if (rawOrder && rawOrder.clothesIdObjectId) {
          order.clothesId = {
            _id: rawOrder.clothesIdObjectId,
            name: order.category || 'Article supprimé',
            category: order.category || 'unknown',
            imageURL: order.imageURL || '',
            style: order.style || '',
            color: order.color || '',
            season: order.season || '',
          };
        }
      }

      // Enrichir avec les données stockées
      const enrichedOrder = this.enrichOrderWithStoredData(order);

      // Créer un objet d'historique unifié
      const historyItem: any = Object.create(null);
      historyItem._id = `sale_${enrichedOrder._id.toString()}`;
      // ✨ Utiliser orderType du Order (doit être 'Sold' car on filtre par orderType = 'Sold')
      historyItem.type = enrichedOrder.orderType || 'Sold';
      historyItem.clothesId = {
        _id: enrichedOrder.clothesId._id || enrichedOrder.clothesId.id || '',
        name: enrichedOrder.clothesId.name || enrichedOrder.category || 'Article',
        category: enrichedOrder.clothesId.category || enrichedOrder.category || 'unknown',
        imageURL: enrichedOrder.clothesId.imageURL || enrichedOrder.imageURL || '',
        style: enrichedOrder.clothesId.style || enrichedOrder.style || '',
        color: enrichedOrder.clothesId.color || enrichedOrder.color || '',
        season: enrichedOrder.clothesId.season || enrichedOrder.season || '',
      };
      historyItem.price = Math.abs(enrichedOrder.price); // ✨ Prix absolu (couleur verte côté frontend)
      historyItem.date = enrichedOrder.orderDate || enrichedOrder.createdAt;
      historyItem.createdAt = enrichedOrder.createdAt;
      historyItem.size = enrichedOrder.size;

      history.push(historyItem);
    });

    // Trier par date (plus récent en premier)
    return history.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt).getTime();
      const dateB = new Date(b.date || b.createdAt).getTime();
      return dateB - dateA;
    });
  }
}
