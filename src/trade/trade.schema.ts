import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TradeType = 'sell' | 'buy';
export type TradeStatus = 'open' | 'requested' | 'completed' | 'canceled';

// 게임 아이템 타입 코드 (w:무기 a:갑옷 h:투구 r:반지 s:방패 p:보조, t/c/e:기타류)
export const TRADE_ITEM_TYPES = ['w', 'a', 'h', 'r', 's', 'p', 't', 'c', 'e'] as const;
export type TradeItemType = (typeof TRADE_ITEM_TYPES)[number];

// 내구도 입력 대상 장비 타입
export const EQUIP_ITEM_TYPES: TradeItemType[] = ['w', 'a', 'h', 'r', 's', 'p'];
// 염색약/형상변환 적용 대상 타입
export const DYEABLE_ITEM_TYPES: TradeItemType[] = ['w', 'a'];

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

  @Prop({ required: true })
  ownerDiscordId: string;

  @Prop()
  ownerMaplestoryWorldId?: string;

  @Prop({ index: true })
  requesterAccountId?: string;

  @Prop()
  requesterNickname?: string;

  @Prop()
  requesterDiscordId?: string;

  @Prop()
  requestedAt?: Date;

  @Prop()
  closedAt?: Date;

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
