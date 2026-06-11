import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateMaplestoryWorldIdDto {
  @Matches(/^[A-Za-z0-9]{5}$/, {
    message: '메이플스토리월드ID 태그 5자리를 입력하세요.',
  })
  maplestoryWorldId: string;

  @IsString()
  @IsNotEmpty({
    message: '메이플스토리월드 닉네임을 입력하세요.',
  })
  @MaxLength(30)
  profileName: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  backgroundId?: number;
}
