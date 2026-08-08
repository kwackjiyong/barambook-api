import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CHAT_TYPES, ChatType } from '../chat-feed.schema';

export class QueryChatFeedDto {
  @IsOptional()
  @IsIn(CHAT_TYPES)
  type?: ChatType;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  content?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  // 과거 방향 페이징. 이 커서보다 오래된 채팅을 가져온다.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

  // 실시간 폴링용. 이 커서보다 새로운 채팅만 가져와 조회 범위를 폴링 간격만큼으로 묶는다.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  since?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
