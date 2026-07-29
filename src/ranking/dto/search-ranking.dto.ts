import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SearchRankingDto {
  /** 캐릭터 이름. 직업과 무관하게 이름만으로 찾는다. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;
}
