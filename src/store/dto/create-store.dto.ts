// src/store/dto/create-store.dto.ts
import { IsMongoId, IsNumber, Min, IsEnum, IsOptional } from 'class-validator';
import { Types } from 'mongoose';

export class CreateStoreDto {
  @IsMongoId()
  clothesId: Types.ObjectId;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsEnum(['available', 'sold'])
  status?: 'available' | 'sold';
}