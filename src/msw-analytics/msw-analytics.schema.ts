import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// 바람클래식(MSW 월드) 게임 서버가 보내는 이벤트 종류.
export const MSW_EVENT_TYPES = [
  'login', // 저장 데이터를 다 불러와 접속이 확정됨
  'logout', // 접속 종료 (data.playSeconds = 이번 접속 시간)
  'level_up', // 레벨 변경 (data.from → level)
  'class_change', // 직업·승급 변경 (data.fromClass, data.fromPromotion)
  'item_pickup', // 바닥 아이템 줍기 (돈 포함)
  'item_drop', // 아이템 버리기
  'money_drop', // 돈 버리기
  'item_throw', // 아이템 던지기
  'death_drop', // 죽어서 떨군 아이템
  'shop_buy',
  'shop_sell',
  'trade', // 교환 완료
] as const;
export type MswEventType = (typeof MSW_EVENT_TYPES)[number];

// 이벤트 원본은 1년 보관한다. 플레이어 요약(msw_players)은 지우지 않는다.
export const MSW_EVENT_RETENTION_DAYS = 365;

@Schema({
  collection: 'msw_events',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class MswEvent extends Document {
  @Prop({ type: String, required: true, enum: MSW_EVENT_TYPES })
  type: MswEventType;

  /** MSW UserId (계정). */
  @Prop({ type: String, required: true, maxlength: 64 })
  userId: string;

  /** 캐릭터 이름. 이름을 정하기 전이면 빈 문자열. */
  @Prop({ type: String, default: '', maxlength: 30 })
  name: string;

  @Prop({ type: Number, default: 0 })
  level: number;

  /** 0 평민, 1 전사, 2 도적, 3 주술사, 4 도사. */
  @Prop({ type: Number, default: 0 })
  classCode: number;

  @Prop({ type: String, default: '', maxlength: 64 })
  map: string;

  /** 게임 서버 시각 (보낸 쪽 기준). 수집 서버 시각은 createdAt. */
  @Prop({ type: Date, required: true })
  at: Date;

  /** 게임 서버 인스턴스 구분용. */
  @Prop({ type: String, default: '', maxlength: 64 })
  instance: string;

  /** 이벤트별 세부 값 (아이템 이름·개수, 상대 이름 등). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  data: Record<string, unknown>;

  createdAt: Date;
}

export const MswEventSchema = SchemaFactory.createForClass(MswEvent);
// 목록은 (at, _id) 최신순으로 쪽을 넘기므로 인덱스도 _id까지 포함해야 메모리 정렬을 피한다.
MswEventSchema.index({ at: -1, _id: -1 });
MswEventSchema.index({ userId: 1, at: -1, _id: -1 });
MswEventSchema.index({ type: 1, at: -1, _id: -1 });
// 보관 기간을 바꿀 때는 chat_messages와 같이 DB에서 TTL 인덱스를 직접 재생성해야 한다.
MswEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: MSW_EVENT_RETENTION_DAYS * 24 * 60 * 60 },
);

/** 계정별 누적 요약. 이벤트가 들어올 때마다 갱신된다. */
@Schema({ collection: 'msw_players', timestamps: true, versionKey: false })
export class MswPlayer extends Document {
  /** MSW UserId. */
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, default: '' })
  name: string;

  @Prop({ type: Number, default: 0 })
  level: number;

  @Prop({ type: Number, default: 0, index: true })
  maxLevel: number;

  @Prop({ type: Number, default: 0 })
  classCode: number;

  @Prop({ type: String, default: '' })
  lastMap: string;

  @Prop({ type: Date, required: true })
  firstSeenAt: Date;

  @Prop({ type: Date, required: true, index: true })
  lastSeenAt: Date;

  @Prop({ type: Number, default: 0 })
  logins: number;

  @Prop({ type: Number, default: 0 })
  playSeconds: number;

  createdAt: Date;
  updatedAt: Date;
}

export const MswPlayerSchema = SchemaFactory.createForClass(MswPlayer);
MswPlayerSchema.index({ name: 1 });
MswPlayerSchema.index({ firstSeenAt: 1 });
MswPlayerSchema.index({ maxLevel: -1, lastSeenAt: -1 });
MswPlayerSchema.index({ playSeconds: -1 });
MswEventSchema.index({ name: 1, at: -1, _id: -1 });

/**
 * KST 하루 단위 집계. 이벤트가 들어올 때 같이 갱신되어 대시보드의 일별 그래프가
 * 이벤트 원본(수백만 건)을 훑지 않게 한다. _id = 'YYYY-MM-DD' (KST).
 */
@Schema({ collection: 'msw_daily', versionKey: false })
export class MswDaily extends Document {
  @Prop({ type: String, required: true })
  _id: string;

  /** 그날 이벤트를 하나라도 남긴 계정 수 (msw_daily_users 신규 삽입 수). */
  @Prop({ type: Number, default: 0 })
  users: number;

  /** 그날 처음 들어온 계정 수. */
  @Prop({ type: Number, default: 0 })
  newPlayers: number;

  @Prop({ type: Number, default: 0 })
  logins: number;

  @Prop({ type: Number, default: 0 })
  playSeconds: number;

  /** 이벤트 종류별 건수. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  events: Record<string, number>;
}

export const MswDailySchema = SchemaFactory.createForClass(MswDaily);

/** (하루, 계정) 한 쌍당 한 문서. 일별 접속자 수를 정확히 세는 데만 쓴다. */
@Schema({ collection: 'msw_daily_users', versionKey: false })
export class MswDailyUser extends Document {
  /** 'YYYY-MM-DD|userId'. */
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  day: string;

  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: Date, required: true })
  createdAt: Date;
}

export const MswDailyUserSchema = SchemaFactory.createForClass(MswDailyUser);
MswDailyUserSchema.index({ day: 1 });
// 일별 접속자 수는 msw_daily.users에 이미 남으므로 쌍 자체는 이벤트와 같이 1년 뒤 지운다.
MswDailyUserSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: MSW_EVENT_RETENTION_DAYS * 24 * 60 * 60 },
);
