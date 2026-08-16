import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MarketCurrency,
  MarketSide,
} from '../../game-market/game-market.parser';
import { MARKET_CURRENCIES, MARKET_SIDES } from '../market-alert.schema';

// 전 단위 시세는 수천만까지 올라가므로 상한을 넉넉히 두되, 자릿수 오타로
// 사실상 무제한이 되는 값은 막는다.
const MAX_PRICE_LIMIT = 1_000_000_000_000;

export class CreateMarketAlertRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  itemId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  itemName: string;

  @IsIn(MARKET_SIDES)
  side: MarketSide;

  @IsIn(MARKET_CURRENCIES)
  currency: MarketCurrency;

  // side가 sell이면 이 값 이하, buy면 이 값 이상일 때 알린다.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_LIMIT)
  priceLimit: number;

  // 미지정이면 염색 없는 일반품만 매칭한다.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  dyeName?: string;

  // 미지정이면 형상변환 없는 매물만 매칭한다.
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  transformItemId?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  transformItemName?: string;
}

export class UpdateMarketAlertRuleDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_LIMIT)
  priceLimit?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
