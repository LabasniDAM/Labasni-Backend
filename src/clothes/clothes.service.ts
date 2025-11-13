import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clothes, ClothesDocument } from './schemas/clothes.schema';
import { CreateClotheDto } from './dto/create-clothe.dto';
import { UpdateClotheDto } from './dto/update-clothe.dto';
import { User } from 'src/user/schemas/user.schema';

@Injectable()
export class ClothesService {
  constructor(
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
    @InjectModel(User.name) private userModel: Model<Document>,
  ) {}

  //  Vérifie si un utilisateur existe avant d'associer un vêtement
  private async verifyUserExists(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new ForbiddenException(`Invalid user ID format`);
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user;
  }

  //  CREATE : avec vérification de la clé étrangère
  async create(createClothesDto: CreateClotheDto & { userId: string }): Promise<Clothes> {
    // Vérifie que l'utilisateur existe
    await this.verifyUserExists(createClothesDto.userId);

    const newClothes = new this.clothesModel({
      ...createClothesDto,
      userId: new Types.ObjectId(createClothesDto.userId), // ← ObjectId
    });

  return await newClothes.save();
}

  //  GET ALL
  async findAll(): Promise<Clothes[]> {
    return await this.clothesModel
      .find()
      .populate('userId', '-password -__v')
      .exec();
  }

  //  GET ONE
  async findOne(id: string): Promise<Clothes> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ForbiddenException(`Invalid clothes ID format`);
    }

    const clothes = await this.clothesModel
      .findById(id)
      .populate('userId', '-password -__v')
      .exec();

    if (!clothes) {
      throw new NotFoundException(`Clothes with ID ${id} not found`);
    }

    return clothes;
  }

  //  UPDATE
  async update(id: string, updateClothesDto: UpdateClotheDto): Promise<Clothes> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ForbiddenException(`Invalid clothes ID format`);
    }

    // Si on change le userId, on vérifie qu’il existe
    if (updateClothesDto.userId) {
      await this.verifyUserExists(updateClothesDto.userId);
    }

    const updated = await this.clothesModel
      .findByIdAndUpdate(id, updateClothesDto, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Clothes with ID ${id} not found`);
    }

    return updated;
  }

  //  DELETE
  async remove(id: string): Promise<Clothes> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ForbiddenException(`Invalid clothes ID format`);
    }

    const deleted = await this.clothesModel.findByIdAndDelete(id).exec();

    if (!deleted) {
      throw new NotFoundException(`Clothes with ID ${id} not found`);
    }

    return deleted;
  }
  async findByUserId(userId: string): Promise<Clothes[]> {
    console.log('findByUserId called with:', userId); // ← AJOUTE ÇA
  if (!Types.ObjectId.isValid(userId)) {
    throw new ForbiddenException('Invalid user ID format');
  }

  // Convertir la string en ObjectId
  return await this.clothesModel
    .find({ userId: new Types.ObjectId(userId) })
    .populate('userId', '-password -__v')
    .exec();
}
}
