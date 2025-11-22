import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ConfirmPurchaseDto {
  @ApiProperty({ description: 'ID du payment intent confirmé', example: 'pi_3ABC...' })
  @IsString({ message: 'paymentIntentId must be a string' })
  paymentIntentId: string;
}