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
    // ✨ CRITIQUE : Re-vérifier le token à chaque envoi pour s'assurer qu'il est à jour
    // Le token peut avoir changé si l'utilisateur a changé de compte
    // Priorité : 1. Token dans le payload, 2. Token dans handshake, 3. Token dans headers
    let token = payload.token || // ✨ NOUVEAU : Token dans le payload du message
                client.handshake.query?.token as string ||
                client.handshake.auth?.token as string;
    
    if (!token) {
      const authHeader = client.handshake.headers?.authorization as string;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    // Re-vérifier le token pour obtenir le senderId actuel
    let senderId = client.user?.sub; // Fallback sur l'ancien user
    let tokenSource = "client.user (ancien)";
    
    if (token) {
      try {
        const jwtPayload = await this.jwtService.verifyAsync(token, {
          secret: JWT_SECRET,
        });
        
        if (jwtPayload?.sub) {
          const newSenderId = jwtPayload.sub;
          
          // Si le senderId a changé, c'est qu'on a changé de compte
          if (senderId && senderId !== newSenderId) {
            this.logger.warn(`⚠️ ATTENTION : senderId a changé !`);
            this.logger.warn(`   - Ancien senderId (client.user): '${senderId}'`);
            this.logger.warn(`   - Nouveau senderId (token actuel): '${newSenderId}'`);
            this.logger.warn(`   - Utilisation du nouveau senderId`);
          }
          
          senderId = newSenderId;
          // Mettre à jour client.user avec le nouveau token
          client.user = jwtPayload;
          
          if (payload.token) {
            tokenSource = "payload (message)";
          } else if (client.handshake.query?.token || client.handshake.auth?.token) {
            tokenSource = "handshake (connexion)";
          } else {
            tokenSource = "headers (Authorization)";
          }
          
          this.logger.log(`🔄 Token re-vérifié - Nouveau senderId: '${senderId}' (source: ${tokenSource})`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ Token invalide lors de l'envoi, utilisation de client.user: ${error.message}`);
      }
    }
    
    if (!senderId) {
      this.logger.warn('❌ send-message sans user');
      client.emit('error', { message: 'Non authentifié' });
      return;
    }

    this.logger.log(`📤 Message de ${senderId} dans ${payload.conversationId}: "${payload.content}"`);
    
    // ✨ AJOUT : Log de debug pour vérifier l'ID
    this.logger.log(`🔑 CRITIQUE - Sender ID utilisé: '${senderId}'`);
    this.logger.log(`🔑 JWT User: ${JSON.stringify(client.user)}`);

    try {
      // 1. Créer le message en base de données AVEC LE BON SENDER ID
      // ⚠️ IMPORTANT : Utiliser senderId du JWT (client.user.sub), PAS du payload
      const message = await this.chatService.createMessage(
        payload.conversationId,
        senderId,  // ← Utiliser l'ID du JWT, pas du payload
        payload.content,
      );

      this.logger.log(`✅ Message créé: ${message._id}`);
      
      // ✨ AJOUT : Vérifier que le senderId dans le message correspond bien
      const messageSenderId = (message.senderId as any)?._id?.toString() || (message.senderId as any)?.toString() || message.senderId?.toString();
      this.logger.log(`✅ Message senderId dans DB: ${messageSenderId}`);
      
      if (messageSenderId !== senderId) {
        this.logger.error(`❌ ERREUR CRITIQUE : senderId mismatch !`);
        this.logger.error(`   - Attendu (JWT): '${senderId}'`);
        this.logger.error(`   - Reçu (Message): '${messageSenderId}'`);
      }
      const roomClients = await this.server.in(`conversation:${payload.conversationId}`).fetchSockets();
      this.logger.log(`📢 Broadcasting à ${roomClients.length} clients dans la room`);
  
      // ✨ CRITIQUE : Sérialiser le message pour s'assurer que senderId est correct
      // Utiliser le senderId du JWT (qui est la source de vérité) au lieu de celui du message
      // Si le senderId du message ne correspond pas, utiliser les données du message mais forcer l'ID
      const messageSenderIdStr = messageSenderId || senderId;
      const messageToEmit = {
        ...message.toJSON(),
        senderId: {
          _id: senderId,  // ← FORCER l'utilisation du senderId du JWT
          id: senderId,   // ← FORCER l'utilisation du senderId du JWT
          fullName: (message.senderId as any)?.fullName || '',
          profilePicture: (message.senderId as any)?.profilePicture || null,
        },
      };
      
      // ✨ Si le senderId ne correspond pas, log un avertissement
      if (messageSenderIdStr !== senderId) {
        this.logger.warn(`⚠️ ATTENTION: senderId mismatch détecté mais corrigé dans messageToEmit`);
        this.logger.warn(`   - JWT senderId: '${senderId}'`);
        this.logger.warn(`   - Message senderId: '${messageSenderIdStr}'`);
        this.logger.warn(`   - Correction appliquée: senderId forcé à '${senderId}' dans messageToEmit`);
      }
      
      // ✨ VÉRIFICATION AVANT ÉMISSION
      this.logger.log(`📤 ÉMISSION DU MESSAGE:`);
      this.logger.log(`   - senderId attendu (JWT): '${senderId}'`);
      this.logger.log(`   - senderId dans messageToEmit: '${messageToEmit.senderId._id || messageToEmit.senderId.id}'`);
      this.logger.log(`   - senderId original du message: '${messageSenderId}'`);
      
      // 2. Broadcaster à TOUS les participants (y compris l'émetteur pour les autres appareils)
      this.server
        .to(`conversation:${payload.conversationId}`)
        .emit('new-message', messageToEmit);

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
