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
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OutfitsService } from './outfits.service';
import { CreateOutfitDto } from './dto/create-outfit.dto';
import { UpdateOutfitDto } from './dto/update-outfit.dto';
import { Outfit } from './schemas/outfits.schema';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';

@ApiTags('Outfits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('outfits')
export class OutfitsController {
  constructor(private readonly outfitsService: OutfitsService) {}

  // CREATE
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new outfit (user from JWT)' })
  @ApiBody({ type: CreateOutfitDto })
  async create(@Body() dto: CreateOutfitDto, @GetUser() user: any): Promise<Outfit> {
    return this.outfitsService.create(dto, user.id);
  }

  // GET ALL (admin ou global)
  @Get()
  @ApiOperation({ summary: 'Retrieve all outfits (admin)' })
  async findAll(): Promise<Outfit[]> {
    return this.outfitsService.findAll();
  }

  // GET MY OUTFITS
  @Get('my')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Récupérer mes outfits' })
  async findMyOutfits(@GetUser() user: any): Promise<Outfit[]> {
    return this.outfitsService.findByUserId(user.id);
  }

  // GET ONE
  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a specific outfit by ID' })
  @ApiParam({ name: 'id', description: 'The ID of the outfit' })
  async findOne(@Param('id') id: string): Promise<Outfit> {
    return this.outfitsService.findOne(id);
  }

  // UPDATE
  @Patch(':id')
  @ApiOperation({ summary: 'Update an outfit by ID' })
  @ApiBody({ type: UpdateOutfitDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOutfitDto,
    @GetUser() user: any,
  ): Promise<Outfit> {
    return this.outfitsService.update(id, dto, user.id);
  }

  // DELETE
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an outfit by ID' })
  async remove(@Param('id') id: string, @GetUser() user: any): Promise<void> {
    await this.outfitsService.remove(id, user.id);
  }

  // Randomly generated outfit

@Post('generate')
@HttpCode(HttpStatus.OK) // PAS 201, car c’est juste une suggestion
@ApiOperation({ summary: 'Générer une suggestion d\'outfit aléatoire' })
@ApiResponse({ status: 200, description: 'Suggestion générée avec succès', type: Outfit })
@ApiResponse({ status: 400, description: 'Pas assez de vêtements (min 3)' })
async generateRandomOutfit(@GetUser() user: any): Promise<Partial<Outfit>> {
  return this.outfitsService.generateRandom(user.id);
}

}