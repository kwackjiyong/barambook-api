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

const toNumber = ({ value }: { value: unknown }) => Number(value);
const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class QueryOldBaramMapsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  // 같은 던전·지역을 묶는 원본 키워드.
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  keyword?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  parentMapId?: number;

  // 미니맵 이미지가 있는 지도만 본다.
  @IsOptional()
  @Transform(toBoolean)
  hasMinimap?: boolean;

  // 출현 몬스터가 기록된 지도만 본다.
  @IsOptional()
  @Transform(toBoolean)
  hasMob?: boolean;

  // 원본에서 막아 둔 지도까지 본다.
  @IsOptional()
  @Transform(toBoolean)
  includeDisabled?: boolean;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(700)
  page = 1;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(12)
  @Max(60)
  limit = 30;

  @IsOptional()
  @IsIn(['id', 'name', 'mob'])
  sort: 'id' | 'name' | 'mob' = 'id';
}
