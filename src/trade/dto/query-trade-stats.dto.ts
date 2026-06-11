import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class QueryTradeStatsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  itemId: number;
}
