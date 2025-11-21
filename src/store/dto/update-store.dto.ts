import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreDto } from './create-store.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  // On rend tous les champs optionnels, y compris size
  @IsOptional()
  @IsString()
  size?: string;
}