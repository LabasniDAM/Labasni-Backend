// src/chat/chat.gateway.ts → VERSION FINALE SANS WsJwtGuard

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JoinConversationDto } from './dto/join-conversation.dto';

// ON UTILISE LE MÊME GUARD QUE POUR LES ROUTES HTTP
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface SocketWithUser extends Socket {
  user?: { sub: string; email: string };
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  // ON UTILISE JwtAuthGuard DIRECTEMENT SUR LA CONNEXION
  @UseGuards(JwtAuthGuard)
  async handleConnection(@ConnectedSocket() client: SocketWithUser) {
    const user = client.user;
    if (!user?.sub) {
      this.logger.warn(`Socket ${client.id} non authentifié → déconnecté`);
      return client.disconnect();
    }

    const userId = user.sub;
    this.logger.log(`User ${userId} connecté (socket: ${client.id})`);

    client.join(`user:${userId}`);

    const conversations = await this.chatService.getUserConversations(userId);
    conversations.forEach((conv: any) => {
      client.join(`conversation:${conv._id.toString()}`);
    });
  }

  handleDisconnect(@ConnectedSocket() client: SocketWithUser) {
    if (client.user?.sub) {
      this.logger.log(`User ${client.user.sub} déconnecté`);
    }
  }

  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: JoinConversationDto,
  ) {
    const userId = client.user?.sub;
    if (!userId) return;

    client.join(`conversation:${payload.conversationId}`);
    const messages = await this.chatService.getMessages(payload.conversationId);
    client.emit('conversation-history', messages);
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() payload: SendMessageDto,
  ) {
    const senderId = client.user?.sub;
    if (!senderId) return;

    const message = await this.chatService.createMessage(
      payload.conversationId,
      senderId,
      payload.content,
    );

    this.server
      .to(`conversation:${payload.conversationId}`)
      .emit('new-message', message);

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
}