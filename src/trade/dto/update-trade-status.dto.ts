import { IsEnum } from 'class-validator';

export enum TradeResolveStatusDto {
  Completed = 'completed',
  Canceled = 'canceled',
}

export class UpdateTradeStatusDto {
  @IsEnum(TradeResolveStatusDto)
  status: TradeResolveStatusDto;
}
