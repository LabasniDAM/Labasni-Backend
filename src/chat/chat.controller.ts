import { 
  Controller, Post, Get, Param, Body, Req, UseGuards, 
  UnauthorizedException, Logger 
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';  // ← IMPORT
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,  // ← INJECTION
  ) {}

  private extractUserId(user: any): string {
    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    if (user._id) {
      return user._id.toString();
    } else if (user.id) {
      return user.id.toString();
    } else if (user.sub) {
      return user.sub;
    } else if (typeof user === 'string') {
      return user;
    }

    this.logger.error('Impossible d\'extraire userId de req.user:', user);
    throw new UnauthorizedException('Invalid user object');
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Créer une conversation avec un autre utilisateur' })
  @ApiBody({ schema: { example: { participantId: '691afd9d2985a29548ff07dd' } } })
  async createConversation(@Req() req: any, @Body('participantId') participantId: string) {
    const userId = this.extractUserId(req.user);
    return this.chatService.ensureConversation(userId, participantId);
  }

  @Get('conversations')
  async getMyConversations(@Req() req: any) {
    const userId = this.extractUserId(req.user);
    return this.chatService.getUserConversations(userId);
  }

  @Get('conversations/:id/messages')
  async getMessages(@Param('id') conversationId: string) {
    return this.chatService.getMessages(conversationId);
  }

  // ENVOYER UN MESSAGE (REST + BROADCAST SOCKET)
  @Post('messages')
  @ApiOperation({ summary: 'Envoyer un message' })
  @ApiBody({ schema: { example: { conversationId: '...', content: 'Salut !' } } })
  async sendMessage(
    @Req() req: any, 
    @Body() body: { conversationId: string; content: string }
  ) {
    try {
      const userId = this.extractUserId(req.user);
      this.logger.log(`📤 Envoi message REST - userId: ${userId}, conversationId: ${body.conversationId}`);
      
      // 1. Créer le message en base
      const message = await this.chatService.createMessage(
        body.conversationId, 
        userId, 
        body.content
      );

      // 2.  BROADCASTER VIA SOCKET
      await this.chatGateway.broadcastMessage(body.conversationId, message);
      this.logger.log(`✅ Message broadcasted via socket depuis REST`);

      return message;
    } catch (error) {
      this.logger.error('❌ Erreur envoi message:', error.message);
      throw error;
    }
  }
}