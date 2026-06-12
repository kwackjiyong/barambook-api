import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

// 인증 시작(POST /auth/maplestory-world-verification)과
// 인증 완료(PATCH /auth/maplestory-world-id)가 같은 입력을 받는다.
// 챌린지 배경은 서버가 정하므로 클라이언트는 배경 번호를 보내지 않는다.
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
}
