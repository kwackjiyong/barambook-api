import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const GAME_MARKET_PERIODS = ['1d', '7d', '30d', '90d'] as const;
export type GameMarketPeriod = (typeof GAME_MARKET_PERIODS)[number];
export const GAME_MARKET_CURRENCIES = ['gold', 'cash'] as const;
export type GameMarketCurrency = (typeof GAME_MARKET_CURRENCIES)[number];

export class QueryGameMarketOverviewDto {
  @IsOptional()
  @IsIn(GAME_MARKET_CURRENCIES)
  currency: GameMarketCurrency = 'gold';

  @IsOptional()
  @IsIn(GAME_MARKET_PERIODS)
  period: GameMarketPeriod = '7d';

  @IsOptional()
  @IsIn(['sell', 'buy'])
  side?: 'sell' | 'buy';

  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 40;
}

export class QueryGameMarketQuotesDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  itemId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemName?: string;

  @IsOptional()
  @IsIn(GAME_MARKET_CURRENCIES)
  currency: GameMarketCurrency = 'gold';

  @IsOptional()
  @IsIn(GAME_MARKET_PERIODS)
  period: GameMarketPeriod = '7d';

  @IsOptional()
  @IsIn(['sell', 'buy'])
  side?: 'sell' | 'buy';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}

/** 아이템 하나의 가격 추이 차트용. 구간 수는 기간이 정하므로 limit이 없다. */
export class QueryGameMarketHistoryDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  itemId: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemName?: string;

  @IsOptional()
  @IsIn(GAME_MARKET_CURRENCIES)
  currency: GameMarketCurrency = 'gold';

  @IsOptional()
  @IsIn(GAME_MARKET_PERIODS)
  period: GameMarketPeriod = '7d';

  @IsOptional()
  @IsIn(['sell', 'buy'])
  side?: 'sell' | 'buy';
}
