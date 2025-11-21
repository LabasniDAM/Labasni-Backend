import { IsMongoId, IsString, IsNotEmpty, IsArray } from "class-validator";

export class SendMessageDto {
     @IsMongoId()
     conversationId: string;

     @IsString()
     @IsNotEmpty()
     content: string;

     // Optionnel : liste des participants (utile pour notifier)
     @IsArray()
     @IsMongoId({ each: true })
     participantIds?: string[];
   }
