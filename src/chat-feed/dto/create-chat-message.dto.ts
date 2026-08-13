import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CHAT_TYPES, ChatType } from '../chat-feed.schema';

export class CreateChatMessageDto {
  @IsIn(CHAT_TYPES)
  type: ChatType;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5)
  @Matches(/^[A-Za-z0-9]{5}$/)
  worldTagId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content: string;
}
