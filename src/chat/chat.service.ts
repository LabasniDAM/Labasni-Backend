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

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
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
    this.logger.log('senderId:', senderId);

    const conversation = await this.conversationModel.findById(conversationId);
    if (!conversation) throw new NotFoundException('Conversation non trouvée');

    const isParticipant = conversation.participants.some((id: any) => id.toString() === senderId);
    if (!isParticipant) throw new ForbiddenException('Tu ne fais pas partie de cette conversation');

    const message = await this.messageModel.create({
      conversationId: conversation._id, // ← ObjectId direct
      senderId: new Types.ObjectId(senderId),
      content,
    });

    this.logger.log('Message créé avec conversationId:', message.conversationId);

    // Mise à jour du lastMessage
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    return await message.populate('senderId', 'fullName profilePicture');
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
      .populate('senderId', 'fullName profilePicture');

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
        populate: { path: 'senderId', select: 'fullName profilePicture' },
      })
      .lean();

    // Pour chaque conversation, récupérer TOUS les messages
    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conv) => {
        //  conv._id est déjà un ObjectId, pas besoin de conversion
        const messages = await this.messageModel
          .find({ conversationId: conv._id })
          .sort({ createdAt: 1 })
          .populate('senderId', 'fullName profilePicture')
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