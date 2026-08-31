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
import {
  GU_BARAM_SHOP_SEARCH_MODE_VALUES,
  GU_BARAM_SHOP_SORTS,
  GuBaramShopSearchMode,
  GuBaramShopSort,
} from '../gu-baram-shop.constants';

const toNumber = ({ value }: { value: unknown }) => Number(value);

export class QueryGuBaramShopsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsIn(GU_BARAM_SHOP_SEARCH_MODE_VALUES)
  mode: GuBaramShopSearchMode = 'shop';

  // 이 아이템을 파는 상점만 본다. 아이템 화면에서 넘어올 때 쓴다.
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  itemId?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(200)
  page = 1;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(12)
  @Max(60)
  limit = 24;

  @IsOptional()
  @IsIn(GU_BARAM_SHOP_SORTS)
  sort: GuBaramShopSort = 'id';
}
