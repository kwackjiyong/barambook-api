import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { Item } from '../guide/item/origin/item.schema';
import {
  GAME_MARKET_RULE_VERSION,
  resolveMarketSearchAlias,
} from './game-market.rules';
import {
  MarketCatalogItem,
  MarketSide,
  parseMarketMessage,
  ParsedMarketQuote,
} from './game-market.parser';
import { GameMarketIngestion, GameMarketQuote } from './game-market.schema';
import {
  GameMarketPeriod,
  QueryGameMarketOverviewDto,
  QueryGameMarketQuotesDto,
} from './dto/query-game-market.dto';

export interface GameMarketChatInput {
  type: string;
  name: string;
  worldTagId: string;
  content: string;
  sourceMessageId: string;
  createdAt?: Date;
}

export interface QuoteStats {
  medianPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  latestPrice: number | null;
  sampleCount: number;
}

const PERIOD_DAYS: Record<GameMarketPeriod, number> = {
  '1d': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};
const CATALOG_TTL_MS = 10 * 60 * 1000;
const OVERVIEW_SCAN_LIMIT = 50_000;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function percentile(sortedValues: number[], ratio: number) {
  if (!sortedValues.length) return null;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * ratio)),
  );
  return sortedValues[index];
}

@Injectable()
export class GameMarketService {
  private readonly logger = new Logger(GameMarketService.name);
  private catalogCache?: { loadedAt: number; items: MarketCatalogItem[] };

  constructor(
    @InjectModel('game_market_quotes', 'barambook')
    private readonly quoteModel: Model<GameMarketQuote>,
    @InjectModel('game_market_ingestions', 'barambook')
    private readonly ingestionModel: Model<GameMarketIngestion>,
    @InjectModel('items', 'barambook')
    private readonly itemModel: Model<Item>,
  ) {}

  async ingestChat(chat: GameMarketChatInput) {
    return this.ingestChats([chat]);
  }

  async ingestChats(chats: GameMarketChatInput[]) {
    const shouts = chats.filter((chat) => chat.type === '사자후');
    if (!shouts.length) return { processed: 0, parsed: 0 };
    const existing = await this.ingestionModel
      .find({
        sourceMessageId: { $in: shouts.map((chat) => chat.sourceMessageId) },
        parserVersion: GAME_MARKET_RULE_VERSION,
      })
      .select({ sourceMessageId: 1 })
      .lean()
      .exec();
    const processedIds = new Set(
      existing.map((entry) => entry.sourceMessageId),
    );
    const pending = shouts.filter(
      (chat) => !processedIds.has(chat.sourceMessageId),
    );
    if (!pending.length) return { processed: 0, parsed: 0 };

    const catalog = await this.loadCatalog();
    const parsedMessages = pending.map((chat) => ({
      chat,
      quotes: parseMarketMessage(chat.content, catalog),
    }));
    const operations = parsedMessages.flatMap(({ chat, quotes }) => {
      const observedAt = chat.createdAt ?? new Date();
      return quotes.map((quote) => {
        const fingerprint = this.createFingerprint(chat, quote);
        return {
          updateOne: {
            filter: { fingerprint },
            update: {
              $set: {
                sourceMessageId: chat.sourceMessageId,
                originalContent: chat.content,
                parserVersion: GAME_MARKET_RULE_VERSION,
              },
              $min: { firstSeenAt: observedAt },
              $max: { lastSeenAt: observedAt },
              $setOnInsert: {
                fingerprint,
                sellerName: chat.name,
                worldTagId: chat.worldTagId.toLowerCase(),
                side: quote.side,
                itemId: quote.itemId,
                itemName: quote.itemName,
                itemType: quote.itemType,
                dyeName: quote.dyeName,
                transformItemId: quote.transformItemId,
                transformItemName: quote.transformItemName,
                durability: quote.durability,
                quantity: quote.quantity,
                bundlePriceDivided: quote.bundlePriceDivided,
                bundleTotalPriceAmount: quote.bundleTotalPriceAmount,
                currency: quote.currency,
                priceAmount: quote.priceAmount,
                priceGold: quote.priceGold,
                priceCashWon: quote.priceCashWon,
                excludedFromGeneral: quote.excludedFromGeneral,
                exclusionReason: quote.exclusionReason,
                originalPriceText: quote.originalPriceText,
                matchedAlias: quote.matchedAlias,
                confidence: quote.confidence,
              },
              $inc: { seenCount: 1 },
            },
            upsert: true,
          },
        };
      });
    });

    if (operations.length) {
      await this.quoteModel.bulkWrite(operations, { ordered: false });
    }
    try {
      await this.ingestionModel.insertMany(
        parsedMessages.map(({ chat, quotes }) => ({
          sourceMessageId: chat.sourceMessageId,
          parserVersion: GAME_MARKET_RULE_VERSION,
          parsedCount: quotes.length,
        })),
        { ordered: false },
      );
    } catch (error) {
      // 동일 원문을 동시에 처리한 경우 unique 인덱스가 마지막 방어선이다.
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
    return {
      processed: pending.length,
      parsed: parsedMessages.reduce(
        (sum, entry) => sum + entry.quotes.length,
        0,
      ),
    };
  }

  async getOverview(query: QueryGameMarketOverviewDto) {
    const since = this.getSince(query.period);
    const filter: FilterQuery<GameMarketQuote> = {
      parserVersion: GAME_MARKET_RULE_VERSION,
      currency: query.currency,
      lastSeenAt: { $gte: since },
    };
    if (query.currency === 'gold') filter.excludedFromGeneral = { $ne: true };
    if (query.side) filter.side = query.side;
    const search = query.search ? resolveMarketSearchAlias(query.search) : '';
    if (search)
      filter.itemName = { $regex: escapeRegExp(search), $options: 'i' };

    const quotes = await this.quoteModel
      .find(filter)
      .sort({ lastSeenAt: -1 })
      .limit(OVERVIEW_SCAN_LIMIT)
      .select({
        itemId: 1,
        itemName: 1,
        itemType: 1,
        side: 1,
        priceAmount: 1,
        firstSeenAt: 1,
        lastSeenAt: 1,
      })
      .lean()
      .exec();

    const groups = new Map<
      string,
      {
        itemId: number;
        itemName: string;
        itemType: string;
        sell: Array<{ price: number; at: Date }>;
        buy: Array<{ price: number; at: Date }>;
        lastSeenAt: Date;
      }
    >();

    for (const quote of quotes) {
      const key = `${quote.itemId}:${quote.itemName}`;
      const current = groups.get(key) ?? {
        itemId: quote.itemId,
        itemName: quote.itemName,
        itemType: quote.itemType,
        sell: [],
        buy: [],
        lastSeenAt: quote.lastSeenAt,
      };
      current[quote.side as MarketSide].push({
        price: quote.priceAmount,
        at: quote.lastSeenAt,
      });
      if (quote.lastSeenAt > current.lastSeenAt)
        current.lastSeenAt = quote.lastSeenAt;
      groups.set(key, current);
    }

    const items = [...groups.values()]
      .map((group) => {
        const preferredSide =
          query.side ?? (group.sell.length ? 'sell' : 'buy');
        return {
          itemId: group.itemId,
          itemName: group.itemName,
          itemType: group.itemType,
          sell: this.toStats(group.sell),
          buy: this.toStats(group.buy),
          spark: this.toSpark(group[preferredSide], since),
          lastSeenAt: group.lastSeenAt.toISOString(),
        };
      })
      .sort((a, b) => {
        const aCount = a.sell.sampleCount + a.buy.sampleCount;
        const bCount = b.sell.sampleCount + b.buy.sampleCount;
        return bCount - aCount || b.lastSeenAt.localeCompare(a.lastSeenAt);
      })
      .slice(0, query.limit);

    return {
      generatedAt: new Date().toISOString(),
      period: query.period,
      currency: query.currency,
      totalQuotes: quotes.length,
      totalItems: groups.size,
      truncated: quotes.length === OVERVIEW_SCAN_LIMIT,
      items,
    };
  }

  async getQuotes(query: QueryGameMarketQuotesDto) {
    const filter: FilterQuery<GameMarketQuote> = {
      parserVersion: GAME_MARKET_RULE_VERSION,
      itemId: query.itemId,
      currency: query.currency,
      lastSeenAt: { $gte: this.getSince(query.period) },
    };
    if (query.itemName) filter.itemName = query.itemName;
    if (query.currency === 'gold') filter.excludedFromGeneral = { $ne: true };
    if (query.side) filter.side = query.side;
    const quotes = await this.quoteModel
      .find(filter)
      .sort({ lastSeenAt: -1 })
      .limit(query.limit)
      .lean()
      .exec();

    return quotes.map((quote) => ({
      id: String(quote._id),
      side: quote.side,
      itemId: quote.itemId,
      itemName: quote.itemName,
      dyeName: quote.dyeName ?? null,
      transformItemId: quote.transformItemId ?? null,
      transformItemName: quote.transformItemName ?? null,
      durability: quote.durability ?? null,
      quantity: quote.quantity,
      bundlePriceDivided: quote.bundlePriceDivided,
      bundleTotalPriceAmount: quote.bundleTotalPriceAmount ?? null,
      currency: quote.currency,
      priceAmount: quote.priceAmount,
      priceGold: quote.priceGold ?? null,
      priceCashWon: quote.priceCashWon ?? null,
      sellerName: quote.sellerName,
      worldTagId: quote.worldTagId,
      originalContent: quote.originalContent,
      confidence: quote.confidence,
      seenCount: quote.seenCount,
      firstSeenAt: quote.firstSeenAt.toISOString(),
      lastSeenAt: quote.lastSeenAt.toISOString(),
    }));
  }

  private getSince(period: GameMarketPeriod) {
    return new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
  }

  private toStats(entries: Array<{ price: number; at: Date }>): QuoteStats {
    if (!entries.length) {
      return {
        medianPrice: null,
        minPrice: null,
        maxPrice: null,
        latestPrice: null,
        sampleCount: 0,
      };
    }
    const prices = entries.map((entry) => entry.price);
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const latest = [...entries].sort(
      (a, b) => b.at.getTime() - a.at.getTime(),
    )[0];
    return {
      medianPrice: median(sortedPrices),
      // 표본이 충분하면 파싱 실수·장난 호가 한두 건이 화면의 범위를
      // 망가뜨리지 않도록 중앙 80% 관측 범위를 사용한다.
      minPrice:
        prices.length >= 5 ? percentile(sortedPrices, 0.1) : sortedPrices[0],
      maxPrice:
        prices.length >= 5
          ? percentile(sortedPrices, 0.9)
          : sortedPrices[sortedPrices.length - 1],
      latestPrice: latest.price,
      sampleCount: prices.length,
    };
  }

  private toSpark(entries: Array<{ price: number; at: Date }>, since: Date) {
    if (!entries.length) return [];
    const bucketCount = 12;
    const duration = Math.max(1, Date.now() - since.getTime());
    const buckets = Array.from({ length: bucketCount }, () => [] as number[]);
    for (const entry of entries) {
      const ratio = (entry.at.getTime() - since.getTime()) / duration;
      const index = Math.max(
        0,
        Math.min(bucketCount - 1, Math.floor(ratio * bucketCount)),
      );
      buckets[index].push(entry.price);
    }
    return buckets.map((bucket) => median(bucket));
  }

  private createFingerprint(
    chat: GameMarketChatInput,
    quote: ParsedMarketQuote,
  ) {
    const value = [
      chat.worldTagId.toLowerCase(),
      chat.name,
      quote.side,
      quote.itemId,
      quote.itemName,
      quote.dyeName ?? '',
      quote.transformItemId ?? '',
      quote.durability ?? '',
      quote.quantity,
      quote.bundlePriceDivided,
      quote.currency,
      quote.priceAmount,
      GAME_MARKET_RULE_VERSION,
    ].join('|');
    return createHash('sha256').update(value).digest('hex');
  }

  private async loadCatalog() {
    const now = Date.now();
    if (
      this.catalogCache &&
      now - this.catalogCache.loadedAt < CATALOG_TTL_MS
    ) {
      return this.catalogCache.items;
    }
    const itemDoc = await this.itemModel.findOne().lean().exec();
    const entries = [
      ...(itemDoc?.equip ?? []),
      ...(itemDoc?.costume ?? []),
      ...(itemDoc?.etc ?? []),
    ];
    const byIdAndName = new Map<string, MarketCatalogItem>();
    for (const entry of entries) {
      if (!entry.name) continue;
      const item = { id: entry.id, name: entry.name, type: entry.type };
      byIdAndName.set(`${item.id}:${item.name}`, item);
    }
    const items = [...byIdAndName.values()];
    this.catalogCache = { loadedAt: now, items };
    if (!items.length)
      this.logger.warn(
        '인게임 시세 파서가 사용할 아이템 도감이 비어 있습니다.',
      );
    return items;
  }
}
