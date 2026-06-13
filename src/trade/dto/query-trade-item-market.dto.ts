import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class QueryTradeItemMarketDto {
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
}
