// src/clothes/dto/create-clothe.dto.ts
import { IsString, IsOptional, IsBoolean, IsObject, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClotheDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty()
  @IsString()
  imageURL: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  season?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCorrected?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  originalDetection?: {
    type: string;
    color: string;
    style: string;
    season: string;
  };

  // ✅ AJOUTÉ pour le VTO
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  processedImageURL?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isProcessed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(['pending', 'processing', 'ready', 'failed'])
  processingStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  processingError?: string;
}