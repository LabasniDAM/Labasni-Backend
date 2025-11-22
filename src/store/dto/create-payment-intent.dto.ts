import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty({ description: 'Montant en cents (ex. : 1000 pour 10 USD)', example: 1000 })
  @IsNumber({}, { message: 'Amount must be a number' })
  amount: number;

  @ApiProperty({ description: 'Devise (ex. : usd)', example: 'usd', required: false })
  @IsOptional()
  @IsString({ message: 'Currency must be a string' })
  currency?: string;
}