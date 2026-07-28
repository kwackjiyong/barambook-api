import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuthProvider = 'google' | 'discord';

// SSO 회원은 레거시 `members` 컬렉션(레거시 MSWID 고유 인덱스 존재)과 분리된
// 별도 컬렉션에 저장한다. 기존 캐릭터/회원 데이터와 연동하지 않는다.
@Schema({ timestamps: true, collection: 'sso_members' })
export class Member extends Document {
  // SSO 계정 식별자 (`${provider}:${providerId}` 형태)
  @Prop({ required: true, unique: true, index: true })
  accountId: string;

  // OAuth 제공자 정보 (SSO 계정에만 존재)
  @Prop({ type: String, enum: ['google', 'discord'] })
  provider?: AuthProvider;

  @Prop()
  providerId?: string;

  @Prop()
  nickname?: string;

  // 마지막 닉네임 변경 시각 (변경 주기 제한용)
  @Prop()
  nicknameUpdatedAt?: Date;

  @Prop()
  email?: string;

  @Prop()
  discordId?: string;

  @Prop()
  maplestoryWorldId?: string;

  @Prop()
  maplestoryWorldProfileName?: string;

  @Prop()
  maplestoryWorldVerifiedAt?: Date;

  // 메월 계정 소유 검증용 배경 변경 챌린지.
  // 서버가 현재 배경과 다른 배경을 골라 저장해 두고, 인증 완료 시 재조회로 검증한다.
  @Prop({ type: Object })
  maplestoryWorldChallenge?: {
    profileCode: string;
    profileName: string;
    backgroundId: number;
    requestedAt: Date;
  };

  // 바람의나라 게임 캐릭터 닉네임. 거래소 게시글 등록/요청에 필요하다.
  @Prop()
  baramNickname?: string;

  // 의상실에서 저장한 대표 캐릭터. request는 렌더러 숫자 코드,
  // input은 재편집용 이름 값. updatedAt은 캐릭터 이미지 캐시 무효화 기준.
  @Prop({ type: Object })
  renderCharacter?: {
    request: {
      head: number;
      headc: number;
      body: number;
      bodyc: number;
      weapon: number;
      weaponc: number;
      weaponrc?: number;
      shield: number;
      shieldc: number;
      skinc?: number;
      // 메월(char-ms) 데이터로 추가된 외형.
      headMode?: 'head' | 'face-hair';
      face?: number;
      hair?: number;
      hairc?: number;
      riding?: number;
      bodyDye?: number;
      weaponDye?: number;
      frame: number;
      isAction: 'Y' | 'N';
    };
    input?: Record<string, unknown>;
    updatedAt: Date;
  };

  // 서버 허용목록(OPERATOR_ACCOUNTS)으로만 부여되는 운영자 권한.
  @Prop({ default: false })
  isOperator: boolean;

  // 사용자 등급 산정에 사용하는 누적 포인트.
  @Prop({ default: 0, min: 0 })
  point: number;

  // 한국 날짜(YYYY-MM-DD) 기준 마지막 출석체크 일자.
  @Prop()
  lastAttendanceDate?: string;

  // 거래 성사 포인트의 한국 날짜 기준 일일 지급 횟수.
  @Prop()
  tradeCompletionPointDate?: string;

  @Prop({ default: 0, min: 0 })
  tradeCompletionPointCount: number;

  // 레거시(캐릭터명/비밀번호) 계정 전용 필드. SSO 계정에는 존재하지 않음.
  @Prop()
  passwordHash?: string;

  @Prop()
  MSWID?: string;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  representativeCharacterName?: string;

  @Prop()
  sessionTokenHash?: string;

  @Prop()
  lastLoginAt?: Date;

  // 사이트(바람비전) 마지막 활동 시각. 프론트 하트비트로 갱신되며
  // 거래소 게시자 활동중/부재중 배지의 기준이 된다.
  @Prop()
  lastActiveAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MemberSchema = SchemaFactory.createForClass(Member);

// SSO 계정 조회/유일성 보장을 위한 복합 인덱스
MemberSchema.index(
  { provider: 1, providerId: 1 },
  { unique: true, sparse: true },
);
