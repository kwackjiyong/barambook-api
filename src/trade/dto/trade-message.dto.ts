import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTradeMessageDto {
  @IsString()
  @IsNotEmpty({ message: '메시지를 입력하세요.' })
  @MaxLength(500)
  content: string;

  // 게시자가 보낼 때 대상 요청자(스레드) accountId. 요청자는 생략한다.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  thread?: string;
}

export class QueryTradeMessagesDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  thread?: string;
}
