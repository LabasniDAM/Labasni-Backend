import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClothesService } from './clothes.service';
import { CreateClotheDto } from './dto/create-clothe.dto';
import { UpdateClotheDto } from './dto/update-clothe.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';

@ApiTags('Clothes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cloth')
export class ClothController {
  constructor(private readonly clothService: ClothesService) {}

  // MODIF : Ajoute isCorrected si originalDetection présent
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new clothing item (user from JWT)' })
  @ApiBody({ type: CreateClotheDto })
  @ApiBearerAuth()
  async create(
    @Body() createClothDto: CreateClotheDto,
    @GetUser() user: any,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    // Ajoute userId automatiquement
    const clothesWithUser = {
      ...createClothDto,
      userId: user.id, // ← AUTOMATIQUE
      isCorrected: !!createClothDto.originalDetection,  // AJOUT : true si correction
    };

    return await this.clothService.create(clothesWithUser);
  }

  // AJOUT : Endpoint pour exporter corrections (admin only, ajoute auth si besoin)
  @Get('corrections')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter les vêtements corrigés pour fine-tuning' })
  async getCorrections() {
    return await this.clothService.findCorrected();
  }

  // ------------------ FIND ALL ------------------
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve all clothing items' })
  @ApiResponse({
    status: 200,
    description: 'List of clothing items retrieved successfully.',
  })
  async findAll() {
    return await this.clothService.findAll();
  }
  
  @Get('my')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer mes vêtements' })
  @ApiResponse({ status: 200, description: 'Liste des vêtements de l\'utilisateur connecté.' })
  @ApiBearerAuth()
  async findMyClothes(@GetUser() user: any) {
  if (!user?.id) {
    throw new UnauthorizedException('Utilisateur non authentifié');
  }

  const clothes = await this.clothService.findByUserId(user.id);
  
  // RETOURNE LE TABLEAU DIRECTEMENT
  return clothes; // ← DOIT ÊTRE [Clothe]
}

  // ------------------ FIND ONE ------------------
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a clothing item by ID' })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the clothing item',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Clothing item found successfully.',
  })
  @ApiNotFoundResponse({
    description: 'No clothing item found with the provided ID.',
  })
  async findOne(@Param('id') id: string) {
    const cloth = await this.clothService.findOne(id);
    if (!cloth) throw new NotFoundException(`No clothing item found with ID ${id}`);
    return cloth;
  }

  // ------------------ UPDATE ------------------
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an existing clothing item' })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the clothing item',
    type: String,
  })
  @ApiBody({
    type: UpdateClotheDto,
    description: 'Data fields to update in the clothing item',
  })
  @ApiResponse({
    status: 200,
    description: 'Clothing item updated successfully.',
  })
  @ApiNotFoundResponse({
    description: 'No clothing item found with the provided ID.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid data sent for update.',
  })
  async update(@Param('id') id: string, @Body() updateClothDto: UpdateClotheDto) {
    try {
      return await this.clothService.update(id, updateClothDto);
    } catch (error) {
      throw new NotFoundException(`Unable to update clothing item with ID ${id}`);
    }
  }

  // ------------------ DELETE (SÉCURISÉ) ------------------
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un de MES vêtements (seulement si je suis le propriétaire)' })
  @ApiParam({ name: 'id', description: 'ID du vêtement à supprimer' })
  @ApiResponse({ status: 204, description: 'Vêtement supprimé avec succès' })
  @ApiNotFoundResponse({ description: 'Vêtement non trouvé' })
  @ApiBearerAuth()
  async removeMyClothe(
    @Param('id') id: string,
    @GetUser() user: any, // ← Utilisateur connecté via JWT
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const success = await this.clothService.removeMyClothe(id, user.id);
    if (!success) {
      throw new NotFoundException(`Vêtement non trouvé ou vous n'êtes pas autorisé à le supprimer`);
    }

    return; // 204 No Content
  }
  
}
