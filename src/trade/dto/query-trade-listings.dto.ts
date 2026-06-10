import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TRADE_ITEM_TYPES, TradeItemType } from '../trade.schema';

// 아이템 타입 필터. 개별 타입 코드 또는 'etc'(무기/갑옷/투구/반지/보조 외 전부)
export type TradeItemTypeFilter = TradeItemType | 'etc';

export class QueryTradeListingsDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsIn(['sell', 'buy'])
  type?: 'sell' | 'buy';

  @IsOptional()
  @IsIn([...TRADE_ITEM_TYPES, 'etc'])
  itemType?: TradeItemTypeFilter;

  // 내구도 N% 이상 (장비 타입 필터와 함께 사용)
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minDurability?: number;

  // 특정 염색약 적용 여부 (무기/갑옷 타입 필터와 함께 사용)
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  dyeItemId?: number;

  // 특정 아이템으로 형상변환 여부 (무기/갑옷 타입 필터와 함께 사용)
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  transformItemId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}
