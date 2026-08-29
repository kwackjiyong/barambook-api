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

export class QueryOldBaramSpellsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsIn(['learnable', 'mob', 'other'])
  category?: 'learnable' | 'mob' | 'other';

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @IsIn([1, 2, 3, 4])
  job?: number;

  // 밑줄로 시작하는 내부 처리용 마법까지 본다.
  @IsOptional()
  @Transform(toBoolean)
  includeInternal?: boolean;

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
  limit = 30;

  @IsOptional()
  @IsIn(['id', 'name', 'level'])
  sort: 'id' | 'name' | 'level' = 'id';
}
