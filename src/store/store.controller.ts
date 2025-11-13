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
}