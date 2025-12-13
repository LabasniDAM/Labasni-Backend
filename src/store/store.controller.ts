import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from './schemas/store.schema';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { ConfirmPurchaseDto } from './dto/confirm-purchase.dto';
import { TestPurchaseDto } from './dto/test-purchase.dto';
import { ConfigService } from '@nestjs/config';

@ApiTags('Store')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('store')
export class StoreController {
  constructor(
    private readonly storeService: StoreService,
    private readonly configService: ConfigService,
  ) {}

  // CREATE
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Mettre en vente un vêtement (user auto)' })
  @ApiBody({ type: CreateStoreDto })
  async create(@Body() dto: CreateStoreDto, @GetUser() user: any): Promise<Store> {
    return this.storeService.create(dto, user.id);
  }

  // GET ALL (admin)
  @Get()
  @ApiOperation({ summary: 'Tous les articles en vente' })
  async findAll(): Promise<Store[]> {
    const stores = await this.storeService.findAll();
    return stores.map(store => this.optimizeStoreUrls(store));
  }

  // GET MY STORE ITEMS
  @Get('my')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mes articles en vente' })
  async findMyStore(@GetUser() user: any): Promise<Store[]> {
    const stores = await this.storeService.findByUserId(user.id);
    return stores.map(store => this.optimizeStoreUrls(store));
  }

  // GET ONE
  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un article' })
  @ApiParam({ name: 'id', description: 'ID du Store item' })
  async findOne(@Param('id') id: string): Promise<Store> {
    const store = await this.storeService.findOne(id);
    return this.optimizeStoreUrls(store);
  }

  // UPDATE
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un article' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @GetUser() user: any,
  ): Promise<Store> {
    return this.storeService.update(id, dto, user.id);
  }

  // DELETE
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un article' })
  async remove(@Param('id') id: string, @GetUser() user: any): Promise<void> {
    await this.storeService.remove(id, user.id);
  }

  // NOUVEAU : Créer payment intent
@Post('payment-intent')
@ApiOperation({ summary: 'Créer un payment intent pour achat' })
@ApiBody({ type: CreatePaymentIntentDto })
async createPaymentIntent(@Body() body: CreatePaymentIntentDto): Promise<{ clientSecret: string }> {
  const clientSecret = await this.storeService.createPaymentIntent(body.amount, body.currency);
  return { clientSecret };
}

@Post('purchase/:id')
@ApiOperation({ summary: 'Confirmer achat (Stripe ou Balance)' })
@ApiBody({ type: ConfirmPurchaseDto })
async confirmPurchase(
  @Param('id') storeItemId: string,
  @Body() dto: ConfirmPurchaseDto,
  @GetUser() user: any,
): Promise<Store> {
  // ✨ CORRIGÉ : Utiliser user.id ou user._id de manière robuste
  // Le user vient de JwtStrategy.validate() qui retourne un SafeUser
  // SafeUser a un id qui peut être undefined, donc on utilise _id comme fallback
  // IMPORTANT : Toujours convertir en string pour éviter les problèmes avec ObjectId
  let buyerId: string = user.id || user._id || (user as any)?._id?.toString();
  
  // ✨ CRITIQUE : S'assurer que buyerId est une string, pas un ObjectId
  if (buyerId && typeof buyerId !== 'string') {
    buyerId = String(buyerId);
  }
  
  if (!buyerId) {
    throw new BadRequestException('User ID not found in token');
  }
  
  console.log('🔍 [StoreController] confirmPurchase');
  console.log('   👤 user.id type:', typeof user.id);
  console.log('   👤 user.id value:', user.id);
  console.log('   👤 buyerId extracted (string):', buyerId);
  console.log('   👤 buyerId type:', typeof buyerId);
  
  return this.storeService.confirmPurchase(storeItemId, dto, buyerId);
}

// ✅ NOUVEAU : Endpoint pour tester l'achat en DEV
/*@Post('test-purchase')
@ApiOperation({ summary: '[DEV ONLY] Tester un achat sans Stripe réel' })
@ApiBody({ type: TestPurchaseDto })
async testPurchase(
  @Body() body: TestPurchaseDto,
  @GetUser() user: any,
): Promise<{ success: boolean; item: Store; message: string }> {
  const isDev = this.storeService['configService'].get('NODE_ENV') === 'development';
  if (!isDev) {
    throw new BadRequestException('This endpoint is only available in development mode');
  }

  // Créer un faux payment intent ID
  const fakePaymentIntentId = `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Confirmer l'achat
  const item = await this.storeService.confirmPurchase(
    body.storeItemId,
    fakePaymentIntentId,
    user.id,
  );

  return {
    success: true,
    item,
    message: `Test purchase successful! Seller balance updated with ${body.amount} USD`,
  };
}*/

  /**
   * 🔧 Optimise les URLs Cloudinary dans un Store
   */
  private optimizeStoreUrls(store: any): Store {
    const storeObj = JSON.parse(JSON.stringify(store));
    
    // Optimiser l'image du vêtement si présent
    if (storeObj.clothe && storeObj.clothe.imageURL) {
      storeObj.clothe.imageURL = this.getOptimizedCloudinaryUrl(storeObj.clothe.imageURL);
    }
    if (storeObj.clothe && storeObj.clothe.processedImageURL) {
      storeObj.clothe.processedImageURL = this.getOptimizedCloudinaryUrl(storeObj.clothe.processedImageURL);
    }
    
    return storeObj;
  }

  /**
   * 🔧 Optimise une URL Cloudinary pour chargement rapide sur mobile
   * Méthode SIMPLE : Insère les transformations directement dans l'URL existante
   * ⚠️ IMPORTANT : Si l'optimisation échoue, retourne l'URL originale pour éviter de casser les images
   */
  private getOptimizedCloudinaryUrl(originalUrl: string): string {
    // Si pas d'URL ou pas Cloudinary, retourner tel quel
    if (!originalUrl || typeof originalUrl !== 'string' || !originalUrl.includes('cloudinary.com')) {
      return originalUrl;
    }

    try {
      // Si l'URL contient déjà des transformations, ne pas la modifier
      if (originalUrl.includes('/f_auto') || originalUrl.includes('/q_auto')) {
        return originalUrl;
      }

      // ✅ MÉTHODE SIMPLE : Insérer les transformations juste après /upload/
      // Format: https://res.cloudinary.com/XXX/image/upload/TRANSFORMATIONS/public_id.ext
      // On remplace /upload/ par /upload/TRANSFORMATIONS/
      
      const transformations = 'f_auto,q_auto:good,w_800,c_limit,fl_progressive';
      
      // Pattern 1: /image/upload/v123/ ou /image/upload/
      if (originalUrl.includes('/image/upload/')) {
        const optimizedUrl = originalUrl.replace(
          /(\/image\/upload\/)(?:v\d+\/)?/,
          `$1${transformations}/`
        );
        return optimizedUrl;
      }
      
      // Pattern 2: /upload/v123/ ou /upload/ (ancien format)
      if (originalUrl.includes('/upload/')) {
        const optimizedUrl = originalUrl.replace(
          /(\/upload\/)(?:v\d+\/)?/,
          `$1${transformations}/`
        );
        return optimizedUrl;
      }

      // Si aucun pattern ne matche, retourner l'URL originale
      return originalUrl;

    } catch (error) {
      // ⚠️ FALLBACK CRITIQUE : En cas d'erreur, TOUJOURS retourner l'URL originale
      return originalUrl;
    }
  }
}