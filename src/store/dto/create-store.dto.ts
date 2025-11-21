import { IsMongoId, IsNumber, IsString, Min, IsEnum, IsOptional } from 'class-validator';
import { Types } from 'mongoose';

export class CreateStoreDto {
  @IsMongoId()
  clothesId: Types.ObjectId;

  @IsNumber()
  @Min(0)
  price: number;

  // Nouveau champ obligatoire
  @IsString()
  size: string;

  @IsOptional()
  @IsEnum(['available', 'sold'])
  status?: 'available' | 'sold';
}