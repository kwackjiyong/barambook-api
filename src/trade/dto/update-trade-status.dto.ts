import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum TradeResolveStatusDto {
  Completed = 'completed',
  Canceled = 'canceled',
}

export class UpdateTradeStatusDto {
  @IsEnum(TradeResolveStatusDto)
  status: TradeResolveStatusDto;

  // 완료 처리 시 거래 상대로 선택한 요청자. 요청이 1건뿐이면 생략 가능.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  requesterAccountId?: string;
}
