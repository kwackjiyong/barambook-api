import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { MarketCurrency, MarketSide } from '../game-market/game-market.parser';

export const MARKET_SIDES = ['sell', 'buy'] as const;
export const MARKET_CURRENCIES = ['gold', 'cash'] as const;

// 계정당 등록 가능한 알림 조건 수. 조건이 늘수록 유입 1건당 매칭 비용도 늘어난다.
export const MAX_RULES_PER_ACCOUNT = 20;

/**
 * 인게임 시세 알림 조건. 장사채널 사자후가 파싱되어 새 매물로 꽂힐 때
 * 이 조건과 대조해 웹푸시를 보낸다.
 *
 * 가격 방향은 side가 결정한다. 파는 매물(sell)은 priceLimit 이하일 때,
 * 사는 매물(buy)은 priceLimit 이상일 때 알린다. 상/하한을 별도 필드로 두면
 * sell + 하한 같은 성립하지 않는 조합이 표현 가능해져 한 필드로 합쳤다.
 */
@Schema({ timestamps: true, collection: 'market_alert_rules' })
export class MarketAlertRule extends Document {
  @Prop({ required: true, index: true })
  accountId: string;

  @Prop({ required: true })
  itemId: number;

  // 표시용 스냅샷. 매칭은 itemId로만 한다.
  @Prop({ required: true })
  itemName: string;

  @Prop({ type: String, enum: MARKET_SIDES, required: true })
  side: MarketSide;

  @Prop({ type: String, enum: MARKET_CURRENCIES, required: true })
  currency: MarketCurrency;

  @Prop({ required: true, min: 1 })
  priceLimit: number;

  // 지정하면 그 염색약이 적용된 매물만, 없으면 염색 없는 일반품만 매칭한다.
  // "아무거나"가 아니라 "일반품"인 것이 핵심이다.
  @Prop()
  dyeName?: string;

  // 지정하면 그 아이템으로 형상변환된 매물만, 없으면 형상변환 없는 매물만 매칭한다.
  @Prop()
  transformItemId?: number;

  @Prop()
  transformItemName?: string;

  @Prop({ required: true, default: true })
  enabled: boolean;

  // 재알림 쿨다운 기준점. 발송 단계에서 갱신한다.
  @Prop()
  lastNotifiedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MarketAlertRuleSchema =
  SchemaFactory.createForClass(MarketAlertRule);

// 내 조건 목록 조회.
MarketAlertRuleSchema.index({ accountId: 1, createdAt: -1 });
// 매물 유입 시 매칭 대상 조건을 itemId로 좁히는 데 쓴다.
MarketAlertRuleSchema.index({ enabled: 1, itemId: 1 });

// 알림 기록을 얼마나 들고 있을지. 이 기간이 지나면 같은 매물이 아직 광고 중이어도
// 조건이 "처음 보는 지문"으로 다시 판단해 한 번 더 알린다.
export const NOTICE_RETENTION_DAYS = 7;

/**
 * 조건이 이미 알린 매물 기록.
 *
 * 중복 판정을 "전역적으로 새 매물인가"가 아니라 "이 조건이 아직 못 본 매물인가"로
 * 옮기기 위한 컬렉션이다. 전자로 판정하면 조건을 걸기 전부터 광고 중이던 매물은
 * 재광고해도 지문이 그대로라 영영 알림이 가지 않는다.
 */
@Schema({ collection: 'market_alert_notices', versionKey: false })
export class MarketAlertNotice extends Document {
  @Prop({ required: true })
  ruleId: string;

  // game_market_quotes.fingerprint와 같은 값.
  @Prop({ required: true })
  fingerprint: string;

  // 판매자 식별자(worldTagId|캐릭명). 쿨다운을 판매자 단위로 거는 데 쓴다.
  @Prop({ required: true })
  sellerKey: string;

  @Prop({ required: true })
  notifiedAt: Date;
}

export const MarketAlertNoticeSchema =
  SchemaFactory.createForClass(MarketAlertNotice);

// 같은 조건이 같은 매물을 두 번 알리지 못하게 막는 마지막 방어선이자,
// 매칭 시 이미 알린 매물을 걸러내는 조회 인덱스를 겸한다.
MarketAlertNoticeSchema.index({ ruleId: 1, fingerprint: 1 }, { unique: true });
// 쿨다운 조회. 판매자까지 키에 넣어, 같은 사람이 값만 바꿔 도배하는 것은 막되
// 다른 사람이 같은 호가를 올리면 그건 새 정보이므로 통과시킨다.
MarketAlertNoticeSchema.index({ ruleId: 1, sellerKey: 1, notifiedAt: -1 });
// 보관 기간이 지난 기록을 자동으로 지운다. TTL은 단일 필드 인덱스여야 해서
// 위 복합 인덱스를 재사용할 수 없다. 기간을 바꿀 때는 DB에서 인덱스를 직접
// 재생성해야 하며, 스키마 숫자만 고치면 기동 시 IndexOptionsConflict가 난다.
MarketAlertNoticeSchema.index(
  { notifiedAt: 1 },
  { expireAfterSeconds: NOTICE_RETENTION_DAYS * 24 * 60 * 60 },
);
