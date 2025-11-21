import { IsMongoId, IsString } from "class-validator";

export class CreateMessageDto {
     @IsMongoId()
     conversationId: string;

     @IsString()
     content: string;
   }