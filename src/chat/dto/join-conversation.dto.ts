import { IsMongoId } from "class-validator";

export class JoinConversationDto {
     @IsMongoId()
     conversationId: string;
   }