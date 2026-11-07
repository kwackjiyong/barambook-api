import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MSW_EVENT_TYPES, MswEventType } from '../msw-analytics.schema';

export class MswEventDto {
  @IsIn(MSW_EVENT_TYPES)
  type: MswEventType;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(255)
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  classCode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  map?: string;

  /** Unix 초. 게임 서버 시각. */
  @IsNumber()
  @Min(1_600_000_000)
  @Max(4_102_444_800)
  at: number;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class IngestMswEventsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  instance?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MswEventDto)
  events: MswEventDto[];
}
