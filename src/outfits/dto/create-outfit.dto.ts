import { IsArray, IsMongoId, IsOptional, IsString, IsEnum } from 'class-validator';
import { Types } from 'mongoose';

export class CreateOutfitDto {
  @IsArray()
  @IsMongoId({ each: true })
  clothesIds: Types.ObjectId[];

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  weatherType?: string;

  @IsOptional()
  @IsEnum(['accepted', 'rejected', 'pending'])
  status?: 'accepted' | 'rejected' | 'pending';
}