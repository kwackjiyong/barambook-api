import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TRADE_ITEM_TYPES, TradeItemType } from '../trade.schema';

export enum TradeTypeDto {
  Sell = 'sell',
  Buy = 'buy',
}

export class CreateTradeListingDto {
  @IsEnum(TradeTypeDto)
  type: TradeTypeDto;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  itemId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  itemName: string;

  @IsIn(TRADE_ITEM_TYPES)
  itemType: TradeItemType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  price: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  // 장비 아이템 내구도(%). 미입력 시 100으로 저장된다.
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  durability?: number;

  // 적용된 염색약 아이템 ID (무기/갑옷만, /trade/dyes 목록 기준)
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  dyeItemId?: number;

  // 형상변환된 대상 아이템 ID (무기/갑옷만)
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  transformItemId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(140)
  memo?: string;
}
