import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';

// 의상실 대표 캐릭터의 렌더러 숫자 코드 (GET /renderer 쿼리와 동일한 의미)
export class RenderCharacterRequestDto {
  @IsInt()
  head: number;

  @IsInt()
  headc: number;

  @IsInt()
  body: number;

  @IsInt()
  bodyc: number;

  @IsInt()
  weapon: number;

  @IsInt()
  weaponc: number;

  @IsOptional()
  @IsInt()
  weaponrc?: number;

  @IsInt()
  shield: number;

  @IsInt()
  shieldc: number;

  @IsInt()
  frame: number;

  @IsIn(['Y', 'N'])
  isAction: 'Y' | 'N';
}

export class UpdateRenderCharacterDto {
  @ValidateNested()
  @Type(() => RenderCharacterRequestDto)
  request: RenderCharacterRequestDto;

  // 의상실 재편집용 입력값(아이템 이름 등). 형태는 FE가 관리한다.
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
