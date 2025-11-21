import { IsBoolean, IsMongoId } from "class-validator";

export class TypingStatusDto {
     @IsMongoId()
     conversationId: string;

     @IsBoolean()
     isTyping: boolean;
   }