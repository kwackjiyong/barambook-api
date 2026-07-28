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

  @IsOptional()
  @IsInt()
  skinc?: number;

  // 메월(char-ms) 데이터로 추가된 외형. 예전 클라이언트는 보내지 않는다.
  @IsOptional()
  @IsIn(['head', 'face-hair'])
  headMode?: 'head' | 'face-hair';

  @IsOptional()
  @IsInt()
  face?: number;

  @IsOptional()
  @IsInt()
  hair?: number;

  @IsOptional()
  @IsInt()
  hairc?: number;

  @IsOptional()
  @IsInt()
  riding?: number;

  @IsOptional()
  @IsInt()
  bodyDye?: number;

  @IsOptional()
  @IsInt()
  weaponDye?: number;

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
