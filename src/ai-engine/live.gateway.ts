// src/ai-engine/live.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { AIEngineService } from './ai-engine.service';
import { ClothesService } from '../clothes/clothes.service';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

// ✅ Support des deux formats
interface ProcessFramePayload {
  frame: string;
  clothingIds?: string[];  // Ancien format (pour compatibilité)
  clothes?: ClothingItem[];  // Nouveau format (direct)
}

interface ClothingItem {
  imageURL: string;
  processedImageURL?: string;
  category: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/vto',
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LiveGateway.name);
  private activeConnections = new Map<string, { userId: string; connectedAt: number }>();

  constructor(
    private readonly aiService: AIEngineService,
    private readonly clothesService: ClothesService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      let token: string | undefined;

      // Vérifier 3 sources pour le token
      if (client.handshake.query?.token) {
        token = Array.isArray(client.handshake.query.token)
          ? client.handshake.query.token[0]
          : client.handshake.query.token;
        this.logger.debug('✅ Token trouvé dans handshake.query');
      }
      else if (client.handshake.headers?.authorization) {
        token = client.handshake.headers.authorization.replace('Bearer ', '');
        this.logger.debug('✅ Token trouvé dans headers.authorization');
      }
      else if (client.handshake.auth?.token) {
        token = client.handshake.auth.token;
        this.logger.debug('✅ Token trouvé dans handshake.auth');
      }

      if (!token) {
        this.logger.warn(`❌ Connexion VTO refusée: pas de token`);
        client.emit('error', {
          message: 'Token JWT requis',
          code: 'NO_TOKEN',
        });
        client.disconnect();
        return;
      }

      // Vérifier le token
      const decoded = this.jwtService.verify(token);
      const userId = decoded.id || decoded.sub;

      if (!userId) {
        throw new UnauthorizedException('Token invalide - pas d\'userId');
      }

      client.userId = userId;

      this.activeConnections.set(client.id, {
        userId,
        connectedAt: Date.now(),
      });

      this.logger.log(
        `✅ Client VTO authentifié: ${client.id} (User: ${userId}) - Total: ${this.activeConnections.size}`,
      );

      // Vérifier service Python
      if (!this.aiService.getHealthStatus()) {
        client.emit('error', {
          message: 'Service VTO temporairement indisponible',
          code: 'SERVICE_UNAVAILABLE',
        });
      } else {
        client.emit('connected', {
          message: 'Connexion VTO établie avec succès',
          status: 'ready',
          userId,
        });
      }
    } catch (error) {
      this.logger.error(`❌ Erreur authentification VTO: ${error.message}`);
      client.emit('error', {
        message: 'Authentification échouée',
        code: 'AUTH_FAILED',
        details: error.message,
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const connectionData = this.activeConnections.get(client.id);
    this.activeConnections.delete(client.id);

    if (connectionData) {
      const duration = Math.round((Date.now() - connectionData.connectedAt) / 1000);
      this.logger.log(
        `🔌 Client VTO déconnecté: ${client.id} (User: ${connectionData.userId}, Durée: ${duration}s) - Restants: ${this.activeConnections.size}`,
      );
    }
  }

  @SubscribeMessage('process_frame')
  async handleProcessFrame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ProcessFramePayload,
  ) {
    const startTime = Date.now();

    try {
      if (!client.userId) {
        client.emit('frame_error', {
          error: 'Non authentifié',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      if (!payload.frame) {
        client.emit('frame_error', {
          error: 'Frame manquante',
          code: 'INVALID_PAYLOAD',
        });
        return;
      }

      let clothingItems: ClothingItem[] = [];

      // ✅ CAS 1 : Format moderne (clothes directement fourni)
      if (payload.clothes && payload.clothes.length > 0) {
        this.logger.debug(`📥 Format moderne: ${payload.clothes.length} vêtement(s) reçus directement`);
        clothingItems = payload.clothes;
      }
      // ✅ CAS 2 : Ancien format (clothingIds à résoudre)
      else if (payload.clothingIds && payload.clothingIds.length > 0) {
        this.logger.debug(`📥 Ancien format: ${payload.clothingIds.length} ID(s) à résoudre`);
        
        const clothes = await this.clothesService.findManyByIds(
          payload.clothingIds,
          client.userId,
        );

        if (clothes.length === 0) {
          client.emit('frame_error', {
            error: 'Aucun vêtement valide trouvé pour ces IDs',
            code: 'NO_CLOTHES_FOUND',
          });
          return;
        }

        clothingItems = clothes.map((cloth) => ({
          imageURL: cloth.imageURL,
          processedImageURL: cloth.processedImageURL || undefined,
          category: cloth.category,
        }));
      }
      // ✅ CAS 3 : Aucun vêtement
      else {
        this.logger.debug('📥 Aucun vêtement sélectionné - retour frame brute');
        client.emit('frame_processed', {
          frame: payload.frame,
          processingTime: Date.now() - startTime,
          fps: 0,
          message: 'Aucun vêtement sélectionné',
        });
        return;
      }

      // ✅ Appel au service Python
      this.logger.debug(`📤 Envoi à Python: ${clothingItems.length} vêtement(s)`);
      for (const item of clothingItems) {
        this.logger.debug(`  - ${item.category}: ${item.processedImageURL ? 'processed' : 'original'}`);
      }

      const result = await this.aiService.processFrameWithClothes(
        payload.frame,
        clothingItems,
      );

      if (result.success) {
        const processingTime = Date.now() - startTime;

        client.emit('frame_processed', {
          frame: result.frame,
          processingTime,
          fps: Math.round(1000 / processingTime),
        });

        this.logger.debug(`✅ Frame traitée en ${processingTime}ms`);

        if (processingTime > 500) {
          this.logger.warn(
            `⚠️ Traitement lent: ${processingTime}ms pour user ${client.userId}`,
          );
        }
      } else {
        this.logger.error(`❌ Erreur Python: ${result.error}`);
        client.emit('frame_error', {
          error: result.error || 'Erreur traitement Python',
          code: 'PROCESSING_FAILED',
        });
      }
    } catch (error) {
      this.logger.error(`❌ Erreur traitement frame: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      
      client.emit('frame_error', {
        error: 'Erreur serveur',
        code: 'INTERNAL_ERROR',
        details: error.message,
      });
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    const connectionData = this.activeConnections.get(client.id);
    const uptime = connectionData
      ? Date.now() - connectionData.connectedAt
      : 0;

    client.emit('pong', {
      timestamp: Date.now(),
      uptime,
      userId: client.userId,
      aiServiceStatus: this.aiService.getHealthStatus() ? 'ok' : 'down',
    });
  }

  @SubscribeMessage('get_stats')
  handleGetStats(@ConnectedSocket() client: AuthenticatedSocket) {
    const connectionData = this.activeConnections.get(client.id);

    client.emit('stats', {
      totalConnections: this.activeConnections.size,
      yourConnectionTime: connectionData
        ? Math.round((Date.now() - connectionData.connectedAt) / 1000)
        : 0,
      aiServiceStatus: this.aiService.getHealthStatus(),
    });
  }

  getActiveConnectionsCount(): number {
    return this.activeConnections.size;
  }

  disconnectAll(reason: string) {
    this.logger.warn(`🔌 Déconnexion de tous les clients VTO: ${reason}`);
    this.server.emit('maintenance', {
      message: reason,
      code: 'MAINTENANCE',
    });
    this.server.disconnectSockets();
  }
}