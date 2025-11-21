import { Type } from "class-transformer";
import { IsMongoId, IsOptional, IsNumber } from "class-validator";

export class ListMessagesDto {
     @IsMongoId()
     conversationId: string;

     @IsOptional()
     @IsNumber()
     @Type(() => Number)
     limit = 20;

     @IsOptional()
     @IsNumber()
     @Type(() => Number)
     offset = 0;
   }