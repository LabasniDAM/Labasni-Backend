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

@ApiTags('Store')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

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
    return this.storeService.findAll();
  }

  // GET MY STORE ITEMS
  @Get('my')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mes articles en vente' })
  async findMyStore(@GetUser() user: any): Promise<Store[]> {
    return this.storeService.findByUserId(user.id);
  }

  // GET ONE
  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un article' })
  @ApiParam({ name: 'id', description: 'ID du Store item' })
  async findOne(@Param('id') id: string): Promise<Store> {
    return this.storeService.findOne(id);
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
@ApiOperation({ summary: 'Confirmer achat et update balance' })
@ApiBody({ type: ConfirmPurchaseDto })  // Ajoutez ça
async confirmPurchase(
  @Param('id') storeItemId: string,
  @Body() body: ConfirmPurchaseDto,
  @GetUser() user: any,
): Promise<Store> {
  return this.storeService.confirmPurchase(storeItemId, body.paymentIntentId, user.id);
}

// ✅ NOUVEAU : Endpoint pour tester l'achat en DEV
@Post('test-purchase')
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
}
}