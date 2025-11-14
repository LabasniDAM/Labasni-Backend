import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Outfit, OutfitDocument } from './schemas/outfits.schema';
import { CreateOutfitDto } from './dto/create-outfit.dto';
import { UpdateOutfitDto } from './dto/update-outfit.dto';
import { Clothes, ClothesDocument } from 'src/clothes/schemas/clothes.schema';

@Injectable()
export class OutfitsService {
  constructor(
    @InjectModel(Outfit.name) private outfitModel: Model<OutfitDocument>,
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
  ) {}

  // Vérifie si un ObjectId est valide
  private isValidId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  // Vérifie que tous les clothesIds appartiennent à l'utilisateur
  private async verifyClothesOwnership(clothesIds: Types.ObjectId[], userId: string) {
    const clothes = await this.clothesModel
      .find({ _id: { $in: clothesIds }, userId: new Types.ObjectId(userId) })
      .exec();

    if (clothes.length !== clothesIds.length) {
      throw new ForbiddenException('Certains vêtements ne vous appartiennent pas');
    }
  }

  // CREATE
  async create(dto: CreateOutfitDto, userId: string): Promise<Outfit> {
    if (!this.isValidId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const objectIdUser = new Types.ObjectId(userId);

    if (dto.clothesIds && dto.clothesIds.length > 0) {
      // Vérifie que tous les clothes existent et appartiennent à l'utilisateur
      await this.verifyClothesOwnership(dto.clothesIds, userId);
    }

    const outfit = new this.outfitModel({
      ...dto,
      userId: objectIdUser,
    });

    return await outfit.save();
  }

  // FIND ALL (admin)
  async findAll(): Promise<Outfit[]> {
    return this.outfitModel
      .find()
      .populate('userId', '-password -__v')
      .populate('clothesIds')
      .exec();
  }

  // FIND BY USER ID
  async findByUserId(userId: string): Promise<Outfit[]> {
    if (!this.isValidId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    return this.outfitModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('userId', '-password -__v')
      .populate('clothesIds')
      .exec();
  }

  /// FIND ONE
async findOne(id: string): Promise<Outfit> {
  if (!this.isValidId(id)) {
    throw new BadRequestException('Invalid outfit ID');
  }

  const outfit = await this.outfitModel
    .findById(id)
    .populate('userId', '-password -__v')
    .populate('clothesIds')
    .exec();

  if (!outfit) {
    throw new NotFoundException(`Outfit with ID ${id} not found`);
  }

  return outfit;
}
  // UPDATE
async update(id: string, dto: UpdateOutfitDto, userId: string): Promise<Outfit> {
  if (!this.isValidId(id)) {
    throw new BadRequestException('Invalid outfit ID');
  }

  const outfit = await this.outfitModel.findById(id).exec();
  if (!outfit) {
    throw new NotFoundException(`Outfit with ID ${id} not found`);
  }

  // Vérifie la propriété
  if (outfit.userId.toString() !== userId) {
    throw new ForbiddenException('Vous ne pouvez pas modifier cet outfit');
  }

  if (dto.clothesIds && dto.clothesIds.length > 0) {
    await this.verifyClothesOwnership(dto.clothesIds, userId);
  }

  const updated = await this.outfitModel
    .findByIdAndUpdate(id, dto, { new: true })
    .populate('userId', '-password -__v')
    .populate('clothesIds')
    .exec();

  if (!updated) {
    throw new NotFoundException(`Outfit with ID ${id} not found after update`);
  }

  return updated;
}
  // DELETE
  async remove(id: string, userId: string): Promise<void> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid outfit ID');
    }

    const outfit = await this.outfitModel.findById(id).exec();
    if (!outfit) {
      throw new NotFoundException(`Outfit with ID ${id} not found`);
    }

    if (outfit.userId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez pas supprimer cet outfit');
    }

    await this.outfitModel.findByIdAndDelete(id).exec();
  }

  // outfits.service.ts


async generateRandom(userId: string): Promise<Partial<Outfit>> {
  if (!this.isValidId(userId)) {
    throw new BadRequestException('Invalid user ID');
  }

  // 1. Récupérer TOUS les vêtements de l'utilisateur
  const userClothes = await this.clothesModel
    .find({ userId: new Types.ObjectId(userId) })
    .exec();

  if (userClothes.length < 3) {
    throw new BadRequestException(
      `Vous avez seulement ${userClothes.length} vêtement(s). Ajoutez-en au moins 3 pour générer un outfit.`,
    );
  }

  // 2. Mélanger et prendre 3 vêtements aléatoires
  const shuffled = userClothes.sort(() => 0.5 - Math.random());
  const selectedClothes = shuffled.slice(0, 3);

  // 3. Retourner un "suggestion" sans sauvegarder
  const clothesIds: Types.ObjectId[] = selectedClothes.map((c) => c._id as Types.ObjectId);

  return {
    clothesIds,
    eventType: 'Aléatoire',
    weatherType: 'Toutes saisons',
    status: 'pending',
  };
}

}