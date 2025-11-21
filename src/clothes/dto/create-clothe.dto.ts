import { IsMongoId, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClotheDto {
  

  @ApiProperty({
    description: 'The URL of the clothing image.',
    example: 'https://example.com/images/tshirt_white.jpg',
  })
  @IsUrl()
  imageURL: string;

  @ApiProperty({
    description: 'Category describing the clothing item.',
    example: 'tshirt',
  })
  @IsString()
  category: string;

  @ApiProperty({
    description: 'Season of the clothing item (optional).',
    example: 'été',
    required: false,
  })
  @IsOptional()
  @IsString()
  season?: string;

  @ApiProperty({
    description: 'Color of the clothing item (optional).',
    example: 'white',
    required: false,
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({
    description: 'Style of the clothing item (optional).',
    example: 'minimalist',
    required: false,
  })
  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()  // AJOUT : Optionnel
  @IsObject()    // AJOUT : C'est un objet
  @ApiProperty({ type: Object, description: 'Détection originale du modèle (pour fine-tuning)', required: false })
  originalDetection?: {  // AJOUT : ? pour optionnel
    type: string;
    color: string;
    style: string;
    season: string;
  };

}
