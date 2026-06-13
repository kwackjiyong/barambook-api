import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// 거래 상세 꺾은선 그래프용 체결가 추이 조회
export class QueryTradePriceHistoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  itemId: number;

  // 지정되면 같은 염색약끼리, 미지정이면 염색 없는 표본끼리 비교한다.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dyeItemId?: number;

  // 지정되면 같은 형상변환끼리, 미지정이면 형상변환 없는 표본끼리 비교한다.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  transformItemId?: number;

  // 조회 기간(일). 기본값은 서비스 상수.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
