import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  price: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ownerDiscordId: string;

  @IsString()
  @IsOptional()
  @MaxLength(140)
  memo?: string;
}
