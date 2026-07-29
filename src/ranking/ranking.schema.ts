import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** 점수 랭킹이 존재하는 직업. 랭킹창이 직업별로 따로 열리므로 Rank 는 직업 안에서의 순위다. */
export const RANKING_CLASSES = ['전사', '도적', '주술사', '도사'] as const;
export type RankingClass = (typeof RANKING_CLASSES)[number];

/** 스캔 앱이 보내는 직업 코드. 접속자 랭킹 파서의 Class 코드와 같은 값을 쓴다. */
export const RANKING_CLASS_BY_CODE: Record<number, RankingClass> = {
  2: '전사',
  3: '도적',
  4: '주술사',
  5: '도사',
};

/**
 * 점수 랭킹 1위~1000위 스냅샷. 캐릭터 이름이 게임 안에서 유일하므로 Name 을 upsert 키로 쓴다.
 *
 * MswId 는 게임이 내려주는 원문이고, 한 계정이 랭킹에 여러 캐릭터를 올리면
 * `abcd(2)` 처럼 소괄호로 중복 수가 붙어 나온다. 같은 계정끼리 묶으려면
 * 괄호를 뗀 MswKey 로 조회해야 한다.
 */
@Schema({ collection: 'user_v3' })
export class UserV3 extends Document {
  @Prop({ required: true, unique: true, index: true })
  Name: string;

  @Prop({ required: true, index: true })
  Class: string;

  @Prop({ type: Number, default: null })
  Point: number | null;

  @Prop({ type: Number, required: true })
  Rank: number;

  /** 게임이 내려준 msw ID 원문 (예: `abcd`, `abcd(2)`). */
  @Prop({ type: String, default: null })
  MswId: string | null;

  /** 괄호 표기를 뗀 계정 식별 키. 동일 계정 캐릭터를 묶는 데 쓴다. */
  @Prop({ type: String, default: null, index: true })
  MswKey: string | null;

  /** 괄호 안의 중복 수 (`abcd(2)` → 2). 표기가 없으면 null. */
  @Prop({ type: Number, default: null })
  MswDuplicateCount: number | null;

  @Prop({ type: Date, required: true })
  ScannedAt: Date;
}

export const UserV3Schema = SchemaFactory.createForClass(UserV3);

// 직업별 순위 정렬 조회용. Rank 는 직업 안에서만 유일하다.
UserV3Schema.index({ Class: 1, Rank: 1 });
