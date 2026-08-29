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
  OLD_BARAM_MOB_SORTS,
  OldBaramMobSort,
} from '../old-baram-mob.constants';

const toNumber = ({ value }: { value: unknown }) => Number(value);
const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class QueryOldBaramMobsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsIn(['s', 'l'])
  size?: string;

  // 출현 위치가 원본에 남아 있는 몬스터만 본다.
  @IsOptional()
  @Transform(toBoolean)
  spawned?: boolean;

  // 마법을 쓰는 몬스터만 본다.
  @IsOptional()
  @Transform(toBoolean)
  caster?: boolean;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(400)
  page = 1;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(12)
  @Max(60)
  limit = 30;

  @IsOptional()
  @IsIn(OLD_BARAM_MOB_SORTS)
  sort: OldBaramMobSort = 'id';
}
