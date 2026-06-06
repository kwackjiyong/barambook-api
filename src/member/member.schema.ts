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

  // 서버 허용목록(OPERATOR_ACCOUNTS)으로만 부여되는 운영자 권한.
  @Prop({ default: false })
  isOperator: boolean;

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
