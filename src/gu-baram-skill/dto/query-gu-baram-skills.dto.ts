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
  GU_BARAM_SKILL_CATEGORY_VALUES,
  GU_BARAM_SKILL_INPUT_VALUES,
  GU_BARAM_SKILL_SORTS,
  GuBaramSkillCategory,
  GuBaramSkillSort,
} from '../gu-baram-skill.constants';

const toNumber = ({ value }: { value: unknown }) => Number(value);

export class QueryGuBaramSkillsDto {
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsIn(GU_BARAM_SKILL_CATEGORY_VALUES)
  category?: GuBaramSkillCategory;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @IsIn(GU_BARAM_SKILL_INPUT_VALUES)
  inputType?: number;

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
  @IsIn(GU_BARAM_SKILL_SORTS)
  sort: GuBaramSkillSort = 'id';
}
