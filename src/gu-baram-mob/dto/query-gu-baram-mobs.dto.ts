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
  GU_BARAM_MOB_SORTS,
  GU_BARAM_MOB_TIER_VALUES,
  GuBaramMobSort,
  GuBaramMobTier,
} from '../gu-baram-mob.constants';

const toNumber = ({ value }: { value: unknown }) => Number(value);

export class QueryGuBaramMobsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsIn(GU_BARAM_MOB_TIER_VALUES)
  tier?: GuBaramMobTier;

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
  @IsIn(GU_BARAM_MOB_SORTS)
  sort: GuBaramMobSort = 'id';
}
