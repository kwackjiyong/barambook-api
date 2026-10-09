import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';
import { RANKING_CLASSES } from '../ranking.schema';

export class EstimateRankingDto {
  /** 직업 이름 (전사/도적/주술사/도사). 랭킹 Rank 는 직업 안에서의 순위다. */
  @IsString()
  @IsIn([...RANKING_CLASSES])
  class: string;

  /** 순위를 가늠할 점수 목록. 쉼표로 구분 (최대 4개). */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?(,\d+(\.\d+)?){0,3}$/)
  points: string;
}
