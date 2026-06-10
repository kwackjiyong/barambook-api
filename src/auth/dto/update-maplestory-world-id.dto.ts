import { Matches } from 'class-validator';

export class UpdateMaplestoryWorldIdDto {
  @Matches(/^[A-Za-z0-9]{5}$/, {
    message: '메이플스토리월드ID 태그 5자리를 입력하세요.',
  })
  maplestoryWorldId: string;
}
