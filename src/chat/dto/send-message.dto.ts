import { IsMongoId, IsString, IsNotEmpty, IsArray, IsOptional } from "class-validator";

export class SendMessageDto {
     @IsMongoId()
     conversationId: string;

     @IsString()
     @IsNotEmpty()
     content: string;

     // Optionnel : liste des participants (utile pour notifier)
     @IsArray()
     @IsMongoId({ each: true })
     @IsOptional()
     participantIds?: string[];
     
     // ✨ NOUVEAU : Token optionnel pour re-vérification
     @IsString()
     @IsOptional()
     token?: string;
   }
