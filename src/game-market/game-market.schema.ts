import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { MarketCurrency, MarketSide } from './game-market.parser';

@Schema({
  collection: 'game_market_quotes',
  timestamps: true,
  versionKey: false,
})
export class GameMarketQuote extends Document {
  @Prop({ required: true, unique: true })
  fingerprint: string;

  @Prop({ required: true })
  sourceMessageId: string;

  @Prop({ required: true })
  sellerName: string;

  @Prop({ required: true })
  worldTagId: string;

  @Prop({ type: String, enum: ['sell', 'buy'], required: true })
  side: MarketSide;

  @Prop({ required: true })
  itemId: number;

  @Prop({ required: true })
  itemName: string;

  @Prop({ required: true })
  itemType: string;

  @Prop()
  dyeName?: string;

  @Prop()
  transformItemId?: number;

  @Prop()
  transformItemName?: string;

  @Prop({ min: 0, max: 100 })
  durability?: number;

  @Prop({ min: 1, default: 1 })
  quantity: number;

  @Prop({ required: true, default: false })
  bundlePriceDivided: boolean;

  @Prop({ min: 1 })
  bundleTotalPriceAmount?: number;

  @Prop({ type: String, enum: ['gold', 'cash'], required: true })
  currency: MarketCurrency;

  @Prop({ required: true, min: 1 })
  priceAmount: number;

  @Prop({ min: 1 })
  priceGold?: number;

  @Prop({ min: 1 })
  priceCashWon?: number;

  @Prop({ required: true, default: false })
  excludedFromGeneral: boolean;

  @Prop({ type: String, enum: ['transform', 'premium_dye'] })
  exclusionReason?: 'transform' | 'premium_dye';

  @Prop({ required: true })
  originalPriceText: string;

  @Prop({ required: true, maxlength: 500 })
  originalContent: string;

  @Prop({ required: true })
  matchedAlias: string;

  @Prop({ required: true, min: 0, max: 1 })
  confidence: number;

  @Prop({ required: true })
  parserVersion: string;

  @Prop({ required: true, default: 1 })
  seenCount: number;

  @Prop({ required: true })
  firstSeenAt: Date;

  @Prop({ required: true })
  lastSeenAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const GameMarketQuoteSchema =
  SchemaFactory.createForClass(GameMarketQuote);

GameMarketQuoteSchema.index({ currency: 1, itemId: 1, side: 1, lastSeenAt: -1 });
GameMarketQuoteSchema.index({ lastSeenAt: -1, itemName: 1 });

@Schema({
  collection: 'game_market_ingestions',
  timestamps: true,
  versionKey: false,
})
export class GameMarketIngestion extends Document {
  @Prop({ required: true })
  sourceMessageId: string;

  @Prop({ required: true })
  parserVersion: string;

  @Prop({ required: true, min: 0 })
  parsedCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export const GameMarketIngestionSchema =
  SchemaFactory.createForClass(GameMarketIngestion);
GameMarketIngestionSchema.index(
  { sourceMessageId: 1, parserVersion: 1 },
  { unique: true },
);
GameMarketIngestionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 120 * 24 * 60 * 60 },
);
