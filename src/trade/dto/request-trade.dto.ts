import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestTradeDto {
  // 거래 요청과 함께 보내는 첫 메모 (선택). 흥정/시간 약속 등.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
