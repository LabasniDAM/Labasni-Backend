import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { AiAnalysisService } from './ai-analysis.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private aiAnalysisService: AiAnalysisService,
  ) {}

  // CRÉER OU RÉCUPÉRER UNE CONVERSATION 1v1
  async ensureConversation(currentUserId: string, partnerId: string) {
    this.logger.log('=== ENSURE CONVERSATION ===');
    this.logger.log('currentUserId reçu:', currentUserId);
    this.logger.log('partnerId:', partnerId);

    if (!currentUserId) {
      this.logger.error('currentUserId est null ou undefined !');
      throw new BadRequestException('currentUserId manquant');
    }

    if (currentUserId === partnerId) {
      throw new BadRequestException('Tu ne peux pas créer une conversation avec toi-même');
    }

    const participants = [currentUserId, partnerId].sort();

    let conversation = await this.conversationModel.findOne({
      participants: { $all: participants, $size: 2 },
    });

    if (!conversation) {
      this.logger.log('Conversation non trouvée, création...');
      conversation = await this.conversationModel.create({
        participants,
        isGroup: false,
      });
    }

    return conversation;
  }

  // ENVOYER UN MESSAGE
  async createMessage(conversationId: string, senderId: string, content: string) {
    this.logger.log('=== CREATE MESSAGE ===');
    this.logger.log('conversationId:', conversationId);
    this.logger.log('senderId reçu:', senderId);
    this.logger.log('senderId type:', typeof senderId);
    
    // ✨ AJOUT : Vérifier que senderId est bien une string et pas undefined
    if (!senderId || senderId === 'undefined') {
      this.logger.error('❌ ERREUR CRITIQUE : senderId invalide !');
      throw new BadRequestException('senderId invalide');
    }

    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation non trouvée');

    // ✨ CRITIQUE : Vérifier que senderId est dans les participants
    const isParticipant = conversation.participants.some((id: any) => {
      const participantId = id._id?.toString() || id.toString();
      const match = participantId === senderId;
      this.logger.log(`   Participant: ${participantId} === ${senderId} ? ${match}`);
      return match;
    });
    
    if (!isParticipant) {
      this.logger.error(`❌ User ${senderId} n'est pas participant !`);
      this.logger.error(`   Participants: ${conversation.participants.map((p: any) => p._id?.toString() || p.toString()).join(', ')}`);
      throw new ForbiddenException('Tu ne fais pas partie de cette conversation');
    }

    // ✨ NOUVEAU : Analyser le message avec l'IA pour extraire des informations
    let extractedInfo = {};
    let maskedContent = content; // Contenu masqué pour l'affichage
    
    try {
      // Essayer d'abord avec Gemini AI
      extractedInfo = await this.aiAnalysisService.analyzeMessage(content);
      
      // Si pas d'info trouvée, utiliser regex comme fallback
      if (Object.keys(extractedInfo).length === 0) {
        extractedInfo = this.aiAnalysisService.extractInfoWithRegex(content);
      }
      
      // ✨ NOUVEAU : Masquer les informations sensibles dans le contenu
      if (Object.keys(extractedInfo).length > 0) {
        this.logger.log(`📊 Informations extraites: ${JSON.stringify(extractedInfo)}`);
        maskedContent = this.aiAnalysisService.maskSensitiveInfo(content, extractedInfo);
        this.logger.log(`🔒 Contenu masqué: "${maskedContent}"`);
      }
    } catch (error) {
      this.logger.warn('Erreur lors de l\'extraction d\'informations, utilisation du fallback regex:', error);
      extractedInfo = this.aiAnalysisService.extractInfoWithRegex(content);
      if (Object.keys(extractedInfo).length > 0) {
        maskedContent = this.aiAnalysisService.maskSensitiveInfo(content, extractedInfo);
      }
    }

    // ✨ CRITIQUE : Créer le message avec le BON senderId
    this.logger.log(`✅ Création du message avec senderId: '${senderId}'`);
    
    const message = await this.messageModel.create({
      conversationId: conversation._id, // ← ObjectId direct
      senderId: new Types.ObjectId(senderId),  // ← IMPORTANT : Utiliser le senderId reçu en paramètre
      content: maskedContent, // ✨ Utiliser le contenu masqué pour l'affichage
      extractedInfo: Object.keys(extractedInfo).length > 0 ? extractedInfo : undefined, // Garder les infos originales pour les actions
    });

    this.logger.log('✅ Message créé avec ID:', message._id);
    this.logger.log('✅ Message senderId final:', message.senderId);

    // Mise à jour du lastMessage
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    // ✨ Populate et retourner
    const populatedMessage = await message.populate('senderId', '_id fullName profilePicture');
    
    // ✨ VÉRIFICATION FINALE
    const finalSenderId = (populatedMessage.senderId as any)?._id?.toString() || (populatedMessage.senderId as any)?.toString() || populatedMessage.senderId?.toString();
    this.logger.log(`🔍 VÉRIFICATION FINALE AVANT POPULATE:`);
    this.logger.log(`   - senderId reçu en paramètre: '${senderId}'`);
    this.logger.log(`   - message.senderId (avant populate): '${message.senderId.toString()}'`);
    this.logger.log(`   - senderId dans le message final (après populate): '${finalSenderId}'`);
    this.logger.log(`   - populatedMessage.senderId (type): ${typeof populatedMessage.senderId}`);
    this.logger.log(`   - populatedMessage.senderId (raw): ${JSON.stringify(populatedMessage.senderId)}`);
    this.logger.log(`   - Match: ${finalSenderId === senderId ? '✅ OUI' : '❌ NON - PROBLÈME !'}`);
    
    if (finalSenderId !== senderId) {
      this.logger.error(`❌ ERREUR CRITIQUE : Le senderId du message ne correspond pas !`);
      this.logger.error(`   - Attendu: '${senderId}'`);
      this.logger.error(`   - Reçu: '${finalSenderId}'`);
      this.logger.error(`   - Cela va causer un problème d'alignement dans le chat !`);
      
      // ✨ CORRECTION : Forcer le bon senderId dans le message
      // Récupérer les infos de l'utilisateur correct depuis la base
      const correctUser = await this.userModel.findById(senderId).exec();
      
      if (correctUser) {
        const userId = (correctUser._id as Types.ObjectId).toString();
        this.logger.log(`✅ Utilisateur correct trouvé: ${correctUser.fullName}`);
        // Remplacer le senderId dans le message avec les bonnes données
        populatedMessage.senderId = {
          _id: userId,
          id: userId,
          fullName: correctUser.fullName,
          profilePicture: correctUser.profilePicture,
        } as any;
        this.logger.log(`✅ senderId corrigé dans le message`);
      } else {
        this.logger.error(`❌ Impossible de trouver l'utilisateur avec l'ID: ${senderId}`);
      }
    }
    
    return populatedMessage;
  }

  // RÉCUPÉRER LES MESSAGES D'UNE CONVERSATION (CORRIGÉ)
  async getMessages(conversationId: string) {
    this.logger.log('=== GET MESSAGES ===');
    this.logger.log('conversationId reçu (string):', conversationId);

    // Convertir la string en ObjectId
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('conversationId invalide');
    }

    const convObjectId = new Types.ObjectId(conversationId);
    this.logger.log('conversationId converti (ObjectId):', convObjectId);

    // Chercher avec l'ObjectId
    const messages = await this.messageModel
      .find({ conversationId: convObjectId })
      .sort({ createdAt: 1 })
      .populate('senderId', '_id fullName profilePicture');

    this.logger.log(`${messages.length} messages trouvés`);

    return messages;
  }

  // MES CONVERSATIONS (avec TOUS les messages)
  async getUserConversations(userId: string) {
    const conversations = await this.conversationModel
      .find({ participants: userId })
      .sort({ updatedAt: -1 })
      .populate('participants', 'fullName profilePicture email')
      .populate({
        path: 'lastMessage',
        populate: { path: 'senderId', select: '_id fullName profilePicture' },
      })
      .lean();

    // Pour chaque conversation, récupérer TOUS les messages
    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conv) => {
        //  conv._id est déjà un ObjectId, pas besoin de conversion
        const messages = await this.messageModel
          .find({ conversationId: conv._id })
          .sort({ createdAt: 1 })
          .populate('senderId', '_id fullName profilePicture')
          .lean();

        return {
          ...conv,
          messages,
          messageCount: messages.length,
        };
      }),
    );

    return conversationsWithMessages;
  }

  // Récupérer une conversation par ID (pour le gateway)
  async getConversationById(conversationId: string) {
    const conv = await this.conversationModel.findById(conversationId).populate('participants');
    if (!conv) throw new NotFoundException('Conversation non trouvée');
    return conv;
  }
}