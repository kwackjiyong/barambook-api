import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// 시세보기 탭에 노출할 인기 종목 수
export class QueryMarketOverviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  limit?: number;
}
