import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TradeType = 'sell' | 'buy';
export type TradeStatus = 'open' | 'requested' | 'completed' | 'canceled';

// 게임 아이템 타입 코드 (w:무기 a:갑옷 h:투구 r:반지 s:방패 p:보조 c:코스튬, t/e:기타류)
export const TRADE_ITEM_TYPES = [
  'w',
  'a',
  'h',
  'r',
  's',
  'p',
  't',
  'c',
  'e',
] as const;
export type TradeItemType = (typeof TRADE_ITEM_TYPES)[number];

// 내구도 입력 대상 장비 타입 (코스튬 'c'는 내구도가 없어 제외)
export const EQUIP_ITEM_TYPES: TradeItemType[] = ['w', 'a', 'h', 'r', 's', 'p'];
// 염색약 적용 대상 타입. 코스튬은 갑옷과 동일하게 의상염색약을 적용할 수 있다.
export const DYEABLE_ITEM_TYPES: TradeItemType[] = ['w', 'a', 'c'];
// 형상변환 적용 대상 타입. 코스튬은 갑옷과 달리 형상변환이 불가능하다.
export const TRANSFORMABLE_ITEM_TYPES: TradeItemType[] = ['w', 'a'];

// 거래 요청자 정보 스냅샷. 게시글 하나에 여러 요청이 쌓일 수 있고
// 게시자가 완료 처리 시 이 중 1명을 거래 상대로 선택한다.
@Schema({ _id: false })
export class TradeRequestEntry {
  @Prop({ required: true })
  requesterAccountId: string;

  @Prop({ required: true })
  requesterNickname: string;

  @Prop()
  requesterDiscordId?: string;

  @Prop()
  requesterEmail?: string;

  @Prop()
  requesterMaplestoryWorldId?: string;

  @Prop()
  requesterBaramNickname?: string;

  // 요청 시점의 메월 인증 여부 스냅샷. 메월 인증은 선택사항이라
  // 미인증(false)인 채로도 요청할 수 있고, 완료 시 시세 표본 제외 판정에 쓴다.
  @Prop()
  requesterVerified?: boolean;

  @Prop({ required: true })
  requestedAt: Date;
}

export const TradeRequestEntrySchema =
  SchemaFactory.createForClass(TradeRequestEntry);

@Schema({ timestamps: true, collection: 'trade_listings' })
export class TradeListing extends Document {
  @Prop({ type: String, enum: ['sell', 'buy'], required: true, index: true })
  type: TradeType;

  @Prop({
    type: String,
    enum: ['open', 'requested', 'completed', 'canceled'],
    default: 'open',
    index: true,
  })
  status: TradeStatus;

  @Prop({ required: true })
  itemId: number;

  @Prop({ required: true, index: true })
  itemName: string;

  // 도입 이전 게시글에는 없을 수 있음. 없으면 '기타'로 취급한다.
  @Prop({ type: String, enum: TRADE_ITEM_TYPES, index: true })
  itemType?: TradeItemType;

  // 장비 아이템 내구도(%). 장비가 아니면 저장하지 않는다.
  @Prop({ min: 0, max: 100 })
  durability?: number;

  // 적용된 염색약 (무기: 무기염색약, 갑옷: 의상염색약)
  @Prop()
  dyeItemId?: number;

  @Prop()
  dyeName?: string;

  // 형상변환된 대상 아이템 (무기/갑옷)
  @Prop()
  transformItemId?: number;

  @Prop()
  transformItemName?: string;

  @Prop({ required: true })
  price: string;

  @Prop({ default: 1 })
  quantity: number;

  @Prop()
  memo?: string;

  @Prop({ required: true, index: true })
  ownerAccountId: string;

  @Prop({ required: true })
  ownerNickname: string;

  // 연락 수단. 디스코드 계정은 디스코드 ID, 구글 계정은 이메일을 쓴다.
  @Prop()
  ownerDiscordId?: string;

  @Prop()
  ownerEmail?: string;

  @Prop()
  ownerMaplestoryWorldId?: string;

  @Prop()
  ownerBaramNickname?: string;

  // 게시 시점의 게시자 메월 인증 여부 스냅샷. 메월 인증은 선택사항이라
  // 미인증(false)이면 매물에 '미인증' 배지를 노출하고, 완료 시 시세 표본에서
  // 제외한다. 도입 이전(필수 인증 시절) 게시글은 필드가 없어 인증으로 취급한다.
  @Prop()
  ownerVerified?: boolean;

  // 진행 중인 거래 요청 목록 (요청 순서대로)
  @Prop({ type: [TradeRequestEntrySchema], default: [] })
  requests: TradeRequestEntry[];

  // 완료 시 선택된 거래 상대 정보. (다중 요청 도입 전 단일 요청자 필드를 겸용)
  @Prop({ index: true })
  requesterAccountId?: string;

  @Prop()
  requesterNickname?: string;

  // 거래 당사자에게만 공개하는 선택된 상대의 메월 태그/바람 닉네임 (완료 시 승격)
  @Prop()
  requesterMaplestoryWorldId?: string;

  @Prop()
  requesterBaramNickname?: string;

  // 완료 시 선택된 거래 상대의 메월 인증 여부 스냅샷 (시세 표본 제외 판정용)
  @Prop()
  requesterVerified?: boolean;

  @Prop()
  requesterDiscordId?: string;

  @Prop()
  requesterEmail?: string;

  @Prop()
  requestedAt?: Date;

  @Prop()
  closedAt?: Date;

  // 거래 완료 포인트가 당사자에게 지급된 시각.
  @Prop()
  completionPointAwardedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const TradeListingSchema = SchemaFactory.createForClass(TradeListing);

TradeListingSchema.index({ status: 1, createdAt: -1 });
TradeListingSchema.index({ itemType: 1, status: 1, createdAt: -1 });
TradeListingSchema.index({ ownerAccountId: 1, status: 1 });
TradeListingSchema.index({ requesterAccountId: 1, status: 1 });
TradeListingSchema.index({ 'requests.requesterAccountId': 1, status: 1 });

// 거래 게시글의 게시자-요청자 간 메모 대화. threadAccountId(요청자)별로 묶인다.
@Schema({ collection: 'trade_messages' })
export class TradeMessage extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  listingId: Types.ObjectId;

  // 대화방 식별자: 요청자 accountId (게시자와 요청자 1:1 스레드)
  @Prop({ required: true })
  threadAccountId: string;

  @Prop({ required: true })
  authorAccountId: string;

  @Prop({ required: true })
  authorNickname: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  createdAt: Date;
}

export const TradeMessageSchema = SchemaFactory.createForClass(TradeMessage);

TradeMessageSchema.index({ listingId: 1, threadAccountId: 1, createdAt: 1 });

// 거래 게시글의 게시자-요청자 1:1 대화방 요약. 메모 작성 시 upsert한다.
// 안읽음 배지/딥링크에 쓰며, 메시지 본문은 trade_messages에 그대로 둔다.
@Schema({ collection: 'trade_threads' })
export class TradeThread extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  listingId: Types.ObjectId;

  @Prop({ required: true, index: true })
  ownerAccountId: string;

  // 대화방 식별자: 요청자 accountId
  @Prop({ required: true, index: true })
  threadAccountId: string;

  @Prop()
  lastMessageAt?: Date;

  @Prop()
  lastMessagePreview?: string;

  @Prop()
  lastAuthorAccountId?: string;

  // 읽음 기준점 (대화방을 조회한 시각)
  @Prop()
  ownerLastReadAt?: Date;

  @Prop()
  requesterLastReadAt?: Date;

  // 안읽음 수. 메시지 수신 시 증가, 조회(읽음) 시 0으로 초기화한다.
  @Prop({ default: 0 })
  ownerUnread: number;

  @Prop({ default: 0 })
  requesterUnread: number;

  // 웹푸시 5분 스로틀 기준점 (수신자별 마지막 푸시 발송 시각)
  @Prop()
  ownerLastPushedAt?: Date;

  @Prop()
  requesterLastPushedAt?: Date;
}

export const TradeThreadSchema = SchemaFactory.createForClass(TradeThread);

TradeThreadSchema.index({ listingId: 1, threadAccountId: 1 }, { unique: true });
