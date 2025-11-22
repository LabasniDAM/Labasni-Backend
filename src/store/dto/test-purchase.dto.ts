import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

export class TestPurchaseDto {
  @ApiProperty({ description: 'Prix du produit (en unités, ex: 10.50)', example: 10.5 })
  @IsNumber()
  @Min(0.5)
  amount: number;

  @ApiProperty({ description: 'ID du store item à acheter', example: '6921a551f26c01f649efade7' })
  @IsString()
  storeItemId: string;
}