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
  GU_BARAM_ITEM_GROUP_VALUES,
  GU_BARAM_ITEM_SORTS,
  GuBaramItemGroup,
  GuBaramItemSort,
} from '../gu-baram-item.constants';

const toNumber = ({ value }: { value: unknown }) => Number(value);
const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class QueryGuBaramItemsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsIn(GU_BARAM_ITEM_GROUP_VALUES)
  group?: GuBaramItemGroup;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5])
  job?: number;

  // 상점에서 살 수 있는 것만 본다.
  @IsOptional()
  @Transform(toBoolean)
  sold?: boolean;

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
  limit = 36;

  @IsOptional()
  @IsIn(GU_BARAM_ITEM_SORTS)
  sort: GuBaramItemSort = 'id';
}
