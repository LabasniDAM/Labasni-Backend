// src/clothes/clothes.controller.ts
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
  UnauthorizedException,
  Query,
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
@Controller('clothes')
export class ClothController {
  constructor(private readonly clothService: ClothesService) {}

  // ==========================================
  // ROUTES VTO - NOUVELLES (EN PREMIER)
  // ==========================================

  /**
   * GET /clothes/my
   * Récupère tous les vêtements de l'utilisateur connecté
   */
  @Get('my')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer tous mes vêtements' })
  async getMyClothes(@GetUser() user: any) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const clothes = await this.clothService.findAllByUser(user.id);
    return clothes; // Retourne directement le tableau pour compatibilité iOS
  }

  /**
   * GET /clothes/my/category/:category
   * Récupère les vêtements par catégorie
   */
  @Get('my/category/:category')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer mes vêtements par catégorie' })
  @ApiParam({ name: 'category', description: 'Catégorie du vêtement' })
  async getMyClothesByCategory(
    @GetUser() user: any,
    @Param('category') category: string,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const clothes = await this.clothService.findByUserAndCategory(
      user.id,
      category,
    );
    return clothes; // Retourne directement le tableau pour compatibilité iOS
  }

  /**
 * GET /clothes/vto/ready
 * Récupère uniquement les vêtements PRÊTS pour le VTO
 * (images détourées et disponibles)
 */
@Get('vto/ready')
@HttpCode(HttpStatus.OK)
@ApiOperation({ 
  summary: 'Récupérer les vêtements prêts pour le Virtual Try-On',
  description: 'Retourne uniquement les vêtements dont les images ont été traitées et sont prêtes pour le VTO'
})
async getVTOReadyClothes(@GetUser() user: any) {
  if (!user?.id) {
    throw new UnauthorizedException('Utilisateur non authentifié');
  }

  const clothes = await this.clothService.findReadyForVTO(user.id);

  // ✅ CORRECTION : Retourner directement l'objet groupé sans wrapper
  const grouped = clothes.reduce((acc, cloth) => {
    const category = cloth.category.toLowerCase();
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({
      id: cloth._id,
      imageURL: cloth.imageURL,
      processedImageURL: cloth.processedImageURL,
      category: cloth.category,
      color: cloth.color,
      style: cloth.style,
      season: cloth.season,
      processingStatus: cloth.processingStatus,  // ✅ Ajouté
      isProcessed: cloth.isProcessed,            // ✅ Ajouté
    });
    return acc;
  }, {});

  // ✅ Pas de wrapper { success, data, etc. }
  return grouped;
}

  /**
   * POST /clothes/vto/batch
   * Récupère plusieurs vêtements par leurs IDs (pour le VTO)
   */
  @Post('vto/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Récupérer plusieurs vêtements par IDs',
    description: 'Utilisé par le VTO pour récupérer les détails de plusieurs vêtements à la fois'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        clothingIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
        }
      }
    }
  })
  async getBatchClothes(
    @Body() body: { clothingIds: string[] },
    @GetUser() user: any,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    if (!body.clothingIds || !Array.isArray(body.clothingIds)) {
      throw new BadRequestException('clothingIds doit être un tableau');
    }

    const clothes = await this.clothService.findManyByIds(
      body.clothingIds,
      user.id,
    );

    return clothes; // Retourne directement le tableau pour compatibilité iOS
  }

  /**
   * POST /clothes/:id/reprocess
   * Relance le traitement d'une image (si échoué)
   */
  @Post(':id/reprocess')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Relancer le traitement d\'une image',
    description: 'Utilisé si le traitement initial a échoué ou si l\'utilisateur veut retraiter l\'image'
  })
  @ApiParam({ name: 'id', description: 'ID du vêtement' })
  async reprocessClothing(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const clothing = await this.clothService.reprocessClothingImage(id, user.id);
    return clothing; // Retourne directement l'objet pour compatibilité iOS
  }

  // ==========================================
  // ROUTES EXISTANTES - CONSERVÉES
  // ==========================================

  @Get('corrections')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter les vêtements corrigés pour fine-tuning' })
  async getCorrections() {
    return await this.clothService.findCorrected(); // Déjà un tableau direct
  }

  @Get('stats/global')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques globales des corrections' })
  async getGlobalStats() {
    return await this.clothService.getGlobalCorrectionStats(); // Retourne directement l'objet stats
  }

  @Get('stats/me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mes statistiques de corrections et préférences' })
  async getMyStats(@GetUser() user: any) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }
    return await this.clothService.getUserStats(user.id); // Retourne directement l'objet stats
  }

  @Get('sell-suggestions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir les vêtements à vendre (rejetés plusieurs fois)' })
  async getSellSuggestions(@GetUser() user: any) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }
    return await this.clothService.getSellSuggestions(user.id); // Retourne directement le tableau
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un nouveau vêtement' })
  async create(@Body() createClothDto: CreateClotheDto, @GetUser() user: any) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const result = await this.clothService.create({
      ...createClothDto,
      userId: user.id,
    });

    return result; // Déjà direct
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer tous les vêtements (admin)' })
  async findAll() {
    return await this.clothService.findAll(); // Déjà un tableau direct
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer un vêtement par ID' })
  @ApiParam({ name: 'id', description: 'ID du vêtement' })
  async findOne(@Param('id') id: string, @GetUser() user: any) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    const cloth = await this.clothService.findOneByIdAndUser(id, user.id);
    return cloth; // Retourne directement l'objet pour compatibilité iOS
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre à jour un vêtement' })
  @ApiParam({ name: 'id', description: 'ID du vêtement' })
  async update(
    @Param('id') id: string,
    @Body() updateClothDto: UpdateClotheDto,
  ) {
    try {
      return await this.clothService.update(id, updateClothDto); // Déjà direct
    } catch (error) {
      throw new NotFoundException(`Unable to update clothing item with ID ${id}`);
    }
  }

  @Patch(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Incrémenter acceptedCount ou rejectedCount' })
  @ApiParam({ name: 'id', description: 'ID du vêtement' })
  async updateFeedback(
    @Param('id') id: string,
    @Body('accepted') accepted: boolean,
    @GetUser() user: any,
  ) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }
    return await this.clothService.updateFeedback(id, accepted, user.id); // Déjà direct
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un de mes vêtements' })
  @ApiParam({ name: 'id', description: 'ID du vêtement' })
  async removeMyClothe(@Param('id') id: string, @GetUser() user: any) {
    if (!user?.id) {
      throw new UnauthorizedException('Utilisateur non authentifié');
    }

    // Utiliser la nouvelle méthode deleteClothing pour VTO
    await this.clothService.deleteClothing(id, user.id);
    return; // Déjà vide (204 No Content)
  }
  /**
 * POST /clothes/migrate-vto
 * Retraite TOUS les vêtements de l'utilisateur pour VTO
 */
@Post('migrate-vto')
@HttpCode(HttpStatus.OK)
@ApiOperation({ 
  summary: 'Retraiter tous mes vêtements pour VTO',
  description: 'Lance le traitement Python pour tous les vêtements qui n\'ont pas d\'image détourée'
})
async migrateUserClothesToVTO(@GetUser() user: any) {
  if (!user?.id) {
    throw new UnauthorizedException('Utilisateur non authentifié');
  }

  const result = await this.clothService.reprocessAllUserClothes(user.id);
  
  return {
    message: `Migration VTO lancée pour ${result.queued} vêtements`,
    total: result.total,
    queued: result.queued,
    note: 'Le traitement peut prendre quelques minutes. Les vêtements seront disponibles progressivement.'
  };
}

/**
 * GET /clothes/vto/status
 * Vérifie le statut du traitement VTO
 */
@Get('vto/status')
@HttpCode(HttpStatus.OK)
@ApiOperation({ 
  summary: 'Obtenir le statut du traitement VTO',
  description: 'Retourne le nombre de vêtements par statut de traitement'
})
async getVTOProcessingStatus(@GetUser() user: any) {
  if (!user?.id) {
    throw new UnauthorizedException('Utilisateur non authentifié');
  }

  const stats = await this.clothService.getVTOProcessingStats(user.id);
  
  return stats;
}
}