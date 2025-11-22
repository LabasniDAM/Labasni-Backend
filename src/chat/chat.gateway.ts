import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JoinConversationDto } from './dto/join-conversation.dto';
import { JWT_SECRET } from '../auth/auth.constants';

interface SocketWithUser extends Socket {
  user?: { sub: string; email: string };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(@ConnectedSocket() client: SocketWithUser) {
    try {
      this.logger.log(`🔌 Nouvelle connexion: ${client.id}`);

      // Récupérer le token
      let token = client.handshake.query?.token as string ||
                  client.handshake.auth?.token as string;
      
      if (!token) {
        const authHeader = client.handshake.headers?.authorization as string;
        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        this.logger.warn('❌ Pas de token fourni');
        client.emit('error', { message: 'Token requis' });
        client.disconnect();
        return;
      }

      // Vérifier le token
      let payload;
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: JWT_SECRET,
        });
      } catch (error) {
        this.logger.error('❌ Token invalide:', error.message);
        client.emit('error', { message: 'Token invalide ou expiré' });
        client.disconnect();
        return;
      }

      if (!payload?.sub) {
        this.logger.warn('❌ Payload invalide');
        client.disconnect();
        return;
      }

      client.user = payload;
      const userId = payload.sub;

      this.logger.log(`✅ User ${userId} authentifié (socket: ${client.id})`);

      // Join rooms
      client.join(`user:${userId}`);

      const conversations = await this.chatService.getUserConversations(userId);
      conversations.forEach((conv: any) => {
        const convId = conv._id.toString();
        client.join(`conversation:${convId}`);
      });

      client.emit('connected', { 
        userId, 
        socketId: client.id,
        message: 'Connexion réussie'
      });
      
      this.logger.log(`✅✅✅ Connexion complète pour user ${userId}`);

    } catch (error) {
      this.logger.error('❌ Erreur handleConnection:', error.message);
      client.emit('error', { message: 'Erreur serveur' });
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: SocketWithUser) {
    if (client.user?.sub) {
      this.logger.log(`🔌 User ${client.user.sub} déconnecté`);
    }
  }

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: JoinConversationDto,
  ) {
    const userId = client.user?.sub;
    if (!userId) return;

    const roomName = `conversation:${payload.conversationId}`;
    client.join(roomName);
    this.logger.log(`🔗 User ${userId} joined ${roomName}`);

    const messages = await this.chatService.getMessages(payload.conversationId);
    client.emit('conversation-history', messages);
  }

  // LA MÉTHODE PRINCIPALE - Gère TOUT (sauvegarde + broadcast)
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: SendMessageDto,
  ) {
    const senderId = client.user?.sub;
    if (!senderId) {
      this.logger.warn('❌ send-message sans user');
      client.emit('error', { message: 'Non authentifié' });
      return;
    }

    this.logger.log(`📤 Message de ${senderId} dans ${payload.conversationId}: "${payload.content}"`);

    try {
      // 1. Créer le message en base de données
      const message = await this.chatService.createMessage(
        payload.conversationId,
        senderId,
        payload.content,
      );

      this.logger.log(`✅ Message créé: ${message._id}`);
      const roomClients = await this.server.in(`conversation:${payload.conversationId}`).fetchSockets();
      this.logger.log(`📢 Broadcasting à ${roomClients.length} clients dans la room`);
  
      // 2. Broadcaster à TOUS les participants (y compris l'émetteur pour les autres appareils)
      this.server
        .to(`conversation:${payload.conversationId}`)
        .emit('new-message', message);

      this.logger.log(`📢 Message broadcasted à conversation:${payload.conversationId}`);

      // 3. Notifier les autres participants (mise à jour de la liste des conversations)
      const conversation = await this.chatService.getConversationById(payload.conversationId);
      conversation.participants.forEach((p: any) => {
        const pid = p._id?.toString() || p.toString();
        if (pid !== senderId) {
          this.server.to(`user:${pid}`).emit('conversation-updated', {
            conversationId: payload.conversationId,
            lastMessage: message,
          });
        }
      });

    } catch (error) {
      this.logger.error('❌ Erreur send-message:', error.message);
      client.emit('error', { message: 'Échec envoi message' });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const userId = client.user?.sub;
    if (!userId) return;

    client
      .to(`conversation:${data.conversationId}`)
      .emit('user-typing', { userId, isTyping: data.isTyping });
  }

  // MÉTHODE PUBLIQUE pour broadcaster depuis le Controller
  async broadcastMessage(conversationId: string, message: any) {
    this.logger.log(`📢 Broadcasting message à conversation:${conversationId}`);
    
    // Broadcaster à tous les participants
    this.server
      .to(`conversation:${conversationId}`)
      .emit('new-message', message);

    // Notifier les autres participants
    try {
      const conversation = await this.chatService.getConversationById(conversationId);
      const senderId = message.senderId._id?.toString() || message.senderId.toString();
      
      conversation.participants.forEach((p: any) => {
        const pid = p._id?.toString() || p.toString();
        if (pid !== senderId) {
          this.server.to(`user:${pid}`).emit('conversation-updated', {
            conversationId,
            lastMessage: message,
          });
          this.logger.log(`🔔 Notification envoyée à user:${pid}`);
        }
      });
    } catch (error) {
      this.logger.error('❌ Erreur lors du broadcast:', error.message);
    }
  }

}
