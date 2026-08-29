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

export class QueryOldBaramItemsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(11)
  type?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @IsIn([1, 2, 3, 4])
  job?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @IsIn([1, 2])
  gender?: number;

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
