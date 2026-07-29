import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RANKING_CLASS_BY_CODE } from '../ranking.schema';

/** 스캔 앱이 한 번에 보내는 최대 행 수. 랭킹은 1000위까지만 노출된다. */
export const RANKING_UPSERT_MAX_ROWS = 1000;

export class RankingRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  rank: number;

  /**
   * 점수. 게임 표기가 `0123.45` 같은 문자열이라 숫자로 못 바꾸는 값도 들어올 수 있어
   * 원문 문자열을 그대로 받고 서버에서 숫자로 정규화한다.
   */
  @IsOptional()
  point?: string | number | null;

  /** msw ID 원문. `abcd(2)` 처럼 중복 표기가 붙어 올 수 있다. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  mswId?: string | null;
}

export class UpsertRankingDto {
  @IsString()
  @IsNotEmpty()
  secret: string;

  /** 스캔 앱에서 고른 직업 코드 (2:전사 3:도적 4:주술사 5:도사). */
  @Type(() => Number)
  @IsInt()
  @IsIn(Object.keys(RANKING_CLASS_BY_CODE).map(Number))
  classCode: number;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(RANKING_UPSERT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => RankingRowDto)
  rows: RankingRowDto[];

  /**
   * true 면 이번 배치에 없는 같은 직업의 기존 행을 지운다.
   * 한 직업의 1~1000위를 통째로 보낼 때만 켜야 순위에서 밀려난 캐릭터가 정리된다.
   */
  @IsOptional()
  @IsBoolean()
  replaceClass?: boolean;
}
