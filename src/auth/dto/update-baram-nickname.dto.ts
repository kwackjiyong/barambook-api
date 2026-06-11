import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateBaramNicknameDto {
  @IsString()
  @IsNotEmpty({ message: '바람의나라 닉네임을 입력하세요.' })
  @MaxLength(16)
  @Matches(/^[가-힣A-Za-z0-9]+$/, {
    message: '바람의나라 닉네임은 한글/영문/숫자만 입력할 수 있습니다.',
  })
  baramNickname: string;
}
