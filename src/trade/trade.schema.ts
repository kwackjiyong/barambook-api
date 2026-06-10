import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TradeType = 'sell' | 'buy';
export type TradeStatus = 'open' | 'requested' | 'completed' | 'canceled';

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
TradeListingSchema.index({ ownerAccountId: 1, status: 1 });
TradeListingSchema.index({ requesterAccountId: 1, status: 1 });
