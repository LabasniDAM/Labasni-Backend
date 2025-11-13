import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Store, StoreDocument } from './schemas/store.schema';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Clothes, ClothesDocument } from '../clothes/schemas/clothes.schema';

@Injectable()
export class StoreService {
  constructor(
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Clothes.name) private clothesModel: Model<ClothesDocument>,
  ) {}

  private isValidId(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }

  // Vérifie que le vêtement existe ET appartient à l'utilisateur
  private async verifyClothesOwnership(clothesId: Types.ObjectId, userId: string) {
    const clothes = await this.clothesModel.findOne({
      _id: clothesId,
      userId: new Types.ObjectId(userId),
    });

    if (!clothes) {
      throw new ForbiddenException('Ce vêtement ne vous appartient pas ou n\'existe pas');
    }
  }

  // CREATE
  async create(dto: CreateStoreDto, userId: string): Promise<Store> {
    if (!this.isValidId(userId) || !this.isValidId(dto.clothesId.toString())) {
      throw new BadRequestException('Invalid ID format');
    }

    await this.verifyClothesOwnership(dto.clothesId, userId);

    const storeItem = new this.storeModel({
      ...dto,
      userId: new Types.ObjectId(userId),
    });

    return await storeItem.save();
  }

  // FIND ALL
  async findAll(): Promise<Store[]> {
    return this.storeModel
      .find()
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();
  }

  // FIND BY USER ID
  async findByUserId(userId: string): Promise<Store[]> {
    if (!this.isValidId(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    return this.storeModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();
  }

  // FIND ONE
  async findOne(id: string): Promise<Store> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid store item ID');
    }

    const item = await this.storeModel
      .findById(id)
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();

    if (!item) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

    return item;
  }

  // UPDATE
  async update(id: string, dto: UpdateStoreDto, userId: string): Promise<Store> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid store item ID');
    }

    const item = await this.storeModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

    if (item.userId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier cet article');
    }

    if (dto.clothesId) {
      await this.verifyClothesOwnership(dto.clothesId, userId);
    }

    const updated = await this.storeModel
      .findOneAndUpdate(
        { _id: id, userId: new Types.ObjectId(userId) },
        dto,
        { new: true },
      )
      .populate('userId', '-password -__v')
      .populate('clothesId')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

    return updated;
  }

  // DELETE
  async remove(id: string, userId: string): Promise<void> {
    if (!this.isValidId(id)) {
      throw new BadRequestException('Invalid store item ID');
    }

    const item = await this.storeModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException(`Store item with ID ${id} not found`);
    }

    if (item.userId.toString() !== userId) {
      throw new ForbiddenException('Vous ne pouvez pas supprimer cet article');
    }

    await this.storeModel.findByIdAndDelete(id).exec();
  }
}