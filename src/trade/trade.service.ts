import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Item } from '../guide/item/origin/item.schema';
import { Member } from '../member/member.schema';
import { MemberService } from '../member/member.service';
import { resolveMverseOnlineByTags } from '../member/mverse-online';
import { NotificationService } from '../notification/notification.service';
import { CreateTradeListingDto } from './dto/create-trade-listing.dto';
import { QueryTradeItemMarketDto } from './dto/query-trade-item-market.dto';
import { QueryTradeListingsDto } from './dto/query-trade-listings.dto';
import { TradeResolveStatusDto } from './dto/update-trade-status.dto';
import {
  DYEABLE_ITEM_TYPES,
  EQUIP_ITEM_TYPES,
  TRANSFORMABLE_ITEM_TYPES,
  TradeItemType,
  TradeListing,
  TradeMessage,
  TradeRequestEntry,
  TradeStatus,
  TradeThread,
} from './trade.schema';

// 게시자의 바람비전 활동 상태. 마지막 사이트 활동(하트비트)이
// OWNER_ACTIVE_WINDOW_MS 이내면 'active'(활동중), 아니면 'away'(부재중).
export type TradeOwnerPresence = 'active' | 'away';

// 거래 요청자 정보. 게시자에게만 전체 연락처가 공개된다.
export interface SerializedTradeRequest {
  requesterAccountId: string;
  nickname: string;
  discordId?: string;
  email?: string;
  maplestoryWorldId?: string;
  baramNickname?: string;
  requestedAt: string;
}

// 메모 대화방 요약. 참여자(게시자/요청자)에게만 내려간다.
export interface SerializedTradeThread {
  // 대화방 식별자(요청자 accountId). 게시자가 스레드를 선택할 때 쓴다.
  threadAccountId: string;
  // 상대 닉네임 (게시자가 보면 요청자, 요청자가 보면 게시자)
  nickname: string;
  unreadCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
}

export interface SerializedTradeListing {
  id: string;
  type: TradeListing['type'];
  status: TradeListing['status'];
  itemId: number;
  itemName: string;
  itemType?: TradeItemType;
  durability?: number;
  dyeItemId?: number;
  dyeName?: string;
  transformItemId?: number;
  transformItemName?: string;
  price: string;
  quantity: number;
  memo?: string;
  ownerNickname: string;
  // 참여자(게시자/요청자)에게만 내려감 — 대화 패널 캐릭터 조회용
  ownerAccountId?: string;
  ownerMaplestoryWorldId?: string;
  ownerBaramNickname?: string;
  ownerPresence?: TradeOwnerPresence;
  ownerMverseOnline?: boolean | null;
  requestCount: number;
  // 게시자에게만 내려가는 요청자 목록 (연락처 포함)
  requests?: SerializedTradeRequest[];
  // 참여자에게만 내려가는 메모 대화방 요약 (안읽음 배지/딥링크용)
  threads?: SerializedTradeThread[];
  requesterNickname?: string;
  // 선택된 거래 상대의 메월 태그(공개) — FE에서 닉네임#태그로 노출
  requesterMaplestoryWorldId?: string;
  ownerDiscordId?: string;
  ownerEmail?: string;
  requesterDiscordId?: string;
  requesterEmail?: string;
  // 같은 아이템·염색·형상변환 조건의 완료 거래 평균 시세
  marketAveragePrice?: number | null;
  marketSampleCount?: number;
  createdAt: string;
  requestedAt?: string;
  closedAt?: string;
  isMine: boolean;
  isRequester: boolean;
}

export interface TradeListingsPage {
  items: SerializedTradeListing[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  openCount: number;
  requestedCount: number;
  // 페이지에 없더라도 내 진행 중 거래를 항상 노출하기 위한 별도 필드
  activeTrade: SerializedTradeListing | null;
}

export interface TradeDyeOption {
  itemId: number;
  name: string;
}

// 염색/형상변환 없는 완료 거래를 표본으로 한 아이템 시세
export interface TradeItemPriceStats {
  itemId: number;
  sampleCount: number;
  averagePrice: number | null;
}

// 홈 화면 등에 노출할 아이템별 최근 시세 목록 항목
export interface TradeItemPriceSummary {
  itemId: number;
  itemName: string;
  itemType?: TradeItemType;
  sampleCount: number;
  averagePrice: number;
  latestPrice: number;
  lastTradedAt: string;
}

// 아이템 시세 패널의 매물 한 건 (공개 정보만 — 연락처/요청자 정보 미포함)
export interface TradeItemMarketEntry {
  id: string;
  type: TradeListing['type'];
  status: TradeListing['status'];
  price: string;
  numericPrice: number | null;
  quantity: number;
  durability?: number;
  dyeItemId?: number;
  dyeName?: string;
  transformItemId?: number;
  transformItemName?: string;
  ownerNickname: string;
  createdAt: string;
  closedAt?: string;
}

// 같은 아이템·옵션의 현재 등록 매물(호가)과 거래완료(체결가)를 나눠 보여준다.
export interface TradeItemMarket {
  itemId: number;
  dyeItemId?: number;
  transformItemId?: number;
  // 현재 거래 가능/진행 중(open·requested) 매물 — 지금 내놓은 가격(호가)
  open: TradeItemMarketEntry[];
  openCount: number;
  openAveragePrice: number | null;
  // 최근 거래완료 매물 — 실제 체결가
  completed: TradeItemMarketEntry[];
  completedCount: number;
  completedAveragePrice: number | null;
}

// 시세보기 탭(주식형) 한 줄. 인기 거래 물품별 평균 호가/평균 체결가/변동률.
export interface TradeMarketOverviewItem {
  itemId: number;
  itemName: string;
  itemType?: TradeItemType;
  // 현재 등록 매물 평균(호가)
  openAveragePrice: number | null;
  openCount: number;
  // 거래완료 평균(체결가) + 최근 체결가
  completedAveragePrice: number | null;
  latestPrice: number | null;
  sampleCount: number;
  lastTradedAt: string;
  // 체결가 기준 변동률 (소수, 0.05 = +5%). 표본이 부족하면 null.
  changeRate: number | null;
  // 미니 스파크라인용 최근 체결가(오래된→최신 순)
  spark: number[];
}

// 거래 상세 꺾은선 그래프용 체결가 추이.
export interface TradePricePoint {
  closedAt: string;
  price: number;
}

export interface TradePriceHistory {
  itemId: number;
  dyeItemId?: number;
  transformItemId?: number;
  points: TradePricePoint[];
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  // 구간 첫 체결가 대비 마지막 체결가 변동률 (소수)
  changeRate: number | null;
}

export interface TradeDyeOptions {
  weaponDyes: TradeDyeOption[];
  armorDyes: TradeDyeOption[];
}

// 내 거래 페이지: 내가 게시한 글과 내가 요청자로 참여한 글
export interface MyTradesResult {
  listings: SerializedTradeListing[];
  requests: SerializedTradeListing[];
}

export interface TradeListingDetail {
  listing: SerializedTradeListing;
  owner: {
    nickname: string;
    joinedAt?: string;
    maplestoryWorldId?: string;
    baramNickname?: string;
  };
  ownerListings: SerializedTradeListing[];
}

export interface SerializedTradeMessage {
  id: string;
  threadAccountId: string;
  authorAccountId: string;
  authorNickname: string;
  content: string;
  createdAt: string;
  isMine: boolean;
}

interface CatalogItem {
  id: number;
  name: string;
  type: string;
  // 코스튬이 덮는 장비 슬롯(w:무기 a:갑옷). 염색약 종류를 가른다.
  baseType?: string;
}

interface MarketStats {
  averagePrice: number;
  sampleCount: number;
}

interface SerializeContext {
  member?: Member | null;
  lastActiveByAccountId?: Map<string, Date>;
  mverseOnlineByTag?: Map<string, boolean | null>;
  marketStatsByKey?: Map<string, MarketStats>;
  // listingId(string) → 호출자가 볼 수 있는 메모 대화방 요약
  threadsByListingId?: Map<string, SerializedTradeThread[]>;
}

// 전역 안읽음 메모 합계 (헤더 배지용)
export interface TradeUnreadSummary {
  total: number;
  threadCount: number;
}

const DEFAULT_PAGE_SIZE = 20;
const OWNER_LISTING_LIMIT = 10;
const PRICE_STATS_SAMPLE_LIMIT = 20;
const PRICE_SUMMARY_DEFAULT_LIMIT = 8;
const PRICE_SUMMARY_SCAN_LIMIT = 400;
// 시세보기 탭 기본 노출 종목 수와 미니 스파크라인 점 개수
const MARKET_OVERVIEW_DEFAULT_LIMIT = 12;
const MARKET_OVERVIEW_SPARK_POINTS = 12;
// 거래 상세 꺾은선 그래프 최대 점 개수와 기본 조회 기간(일)
const PRICE_HISTORY_MAX_POINTS = 60;
const PRICE_HISTORY_DEFAULT_DAYS = 90;
// 아이템 시세 패널에 노출할 현재 매물/체결 목록 최대 건수
const MARKET_LIST_LIMIT = 12;
const MY_TRADES_LIMIT = 50;
// 활동중 우선 정렬을 위해 한 번에 스캔하는 최대 게시글 수
const LISTING_SCAN_LIMIT = 400;
// 진행 중(open/requested) 게시글 등록 한도
const ACTIVE_LISTING_LIMIT = 5;
// 한 회원이 동시에 보낼 수 있는 거래 요청 한도
const ACTIVE_REQUEST_LIMIT = 5;
// 게시글 하나에 쌓일 수 있는 요청 한도
const LISTING_REQUEST_LIMIT = 20;
const TRADE_MESSAGE_LIMIT = 100;
// 요청 첫 메모 최대 길이 (DTO와 동일)
const REQUEST_MESSAGE_MAX_LENGTH = 200;
// 같은 대화방 같은 수신자에게 웹푸시를 다시 보내기까지의 최소 간격 (5분)
const MESSAGE_PUSH_THROTTLE_MS = 5 * 60 * 1000;
// 대화방 요약/푸시 본문에 노출할 메시지 미리보기 길이
const MESSAGE_PREVIEW_LENGTH = 60;
// 마지막 사이트 활동이 이 시간 이내면 게시자를 '활동중'으로 본다
const OWNER_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
// 대화방을 마지막으로 조회(FE 5초 폴링)한 지 이 시간 이내면 '대화 참여중'으로 본다
const THREAD_PRESENCE_WINDOW_MS = 15 * 1000;
// 내 거래 페이지 정렬: 내가 처리해야 할 'requested'를 가장 위로 끌어올린다.
// 거래소 홈에는 적용하지 않는다(아래 HOME_STATUS_GROUP 사용).
const STATUS_SORT_ORDER: TradeStatus[] = [
  'requested',
  'open',
  'completed',
  'canceled',
];

// 거래소 홈 정렬: open과 requested를 같은 "거래 가능" 그룹으로 묶고,
// 종료 상태(completed/canceled)만 뒤로 보낸다. 대화 요청이 들어왔다고
// 게시글을 상단으로 끌어올리지 않는다 — 그 규칙은 내 거래 페이지에서만 쓴다.
const HOME_STATUS_GROUP: Record<TradeStatus, number> = {
  open: 0,
  requested: 0,
  completed: 1,
  canceled: 1,
};
const ITEM_CATALOG_TTL_MS = 10 * 60 * 1000;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 자유 문자열 가격에서 숫자(콤마 허용) 가격만 읽는다. 그 외는 null.
const parseNumericPrice = (price: string): number | null => {
  const numeric = price.replace(/,/g, '').trim();

  if (!/^\d+$/.test(numeric)) {
    return null;
  }

  const value = Number(numeric);
  return value > 0 ? value : null;
};

// 아이템·염색·형상변환 조합별 시세 그룹 키
const getMarketStatsKey = (listing: {
  itemId: number;
  dyeItemId?: number;
  transformItemId?: number;
}) =>
  `${listing.itemId}:${listing.dyeItemId ?? ''}:${listing.transformItemId ?? ''}`;

@Injectable()
export class TradeService {
  private itemCatalogCache: {
    loadedAt: number;
    equip: CatalogItem[];
    etc: CatalogItem[];
    costume: CatalogItem[];
  } | null = null;

  constructor(
    @InjectModel('trade_listings', 'barambook')
    private readonly tradeListingModel: Model<TradeListing>,
    @InjectModel('trade_messages', 'barambook')
    private readonly tradeMessageModel: Model<TradeMessage>,
    @InjectModel('trade_threads', 'barambook')
    private readonly tradeThreadModel: Model<TradeThread>,
    @InjectModel('items', 'barambook')
    private readonly itemModel: Model<Item>,
    private readonly memberService: MemberService,
    private readonly notificationService: NotificationService,
  ) {}

  async findListings(
    query: QueryTradeListingsDto,
    member?: Member | null,
  ): Promise<TradeListingsPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter = this.buildListingFilter(query);
    const priceConditions: Record<string, number> = {};

    if (query.minPrice != null) {
      priceConditions.$gte = query.minPrice;
    }

    if (query.maxPrice != null) {
      priceConditions.$lte = query.maxPrice;
    }

    const hasPriceFilter = Object.keys(priceConditions).length > 0;
    const sortByPrice = query.sort === 'price';
    // 가격순: 팝니다는 싼 매물 먼저(오름), 삽니다는 비싼 매물 먼저(내림)
    const priceDirection = query.type === 'buy' ? -1 : 1;
    const sortStage: Record<string, 1 | -1> = sortByPrice
      ? {
          statusGroup: 1,
          hasNumericPrice: -1,
          numericPrice: priceDirection,
          createdAt: -1,
        }
      : { statusGroup: 1, createdAt: -1 };

    const [result] = await this.tradeListingModel
      .aggregate<{
        items: TradeListing[];
        total: { count: number }[];
        statusCounts: { _id: TradeStatus; count: number }[];
      }>([
        { $match: filter },
        {
          $addFields: {
            // open·requested(0) → completed·canceled(1) 두 그룹만 둔다.
            statusGroup: {
              $cond: [{ $in: ['$status', ['completed', 'canceled']] }, 1, 0],
            },
            // 숫자(콤마 허용) 가격. '가격 협의' 등은 null이 되어 가격순에서 뒤로 밀린다.
            numericPrice: {
              $convert: {
                input: {
                  $replaceAll: {
                    input: { $trim: { input: '$price' } },
                    find: ',',
                    replacement: '',
                  },
                },
                to: 'double',
                onError: null,
                onNull: null,
              },
            },
          },
        },
        {
          $addFields: {
            hasNumericPrice: {
              $cond: [{ $eq: ['$numericPrice', null] }, 0, 1],
            },
          },
        },
        // 가격 필터가 있을 때만 숫자 가격으로 범위를 거른다
        ...(hasPriceFilter
          ? [{ $match: { numericPrice: priceConditions } }]
          : []),
        { $sort: sortStage },
        {
          $facet: {
            items: [{ $limit: LISTING_SCAN_LIMIT }],
            total: [{ $count: 'count' }],
            statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          },
        },
      ])
      .exec();

    const total = result.total[0]?.count ?? 0;
    const countByStatus = new Map(
      result.statusCounts.map((entry) => [entry._id, entry.count]),
    );

    const activeTrade = member ? await this.findActiveTrade(member) : null;

    const ownerAccountIds = new Set(
      result.items.map((listing) => listing.ownerAccountId),
    );

    if (activeTrade) {
      ownerAccountIds.add(activeTrade.ownerAccountId);
    }

    const lastActiveByAccountId =
      await this.memberService.findLastActiveByAccountIds([...ownerAccountIds]);

    // 메월 접속여부는 진행 중 게시글의, 사이트 활동중이 아닌 게시자만 조회한다
    const onlineCheckTags = result.items
      .filter(
        (listing) =>
          (listing.status === 'open' || listing.status === 'requested') &&
          listing.ownerMaplestoryWorldId &&
          !this.isSiteActive(listing.ownerAccountId, lastActiveByAccountId),
      )
      .map((listing) => listing.ownerMaplestoryWorldId as string);

    const mverseOnlineByTag = await resolveMverseOnlineByTags(onlineCheckTags);

    // 가격순은 집계에서 이미 정렬되어 있어 그대로 쓰고,
    // 기본순은 상태 그룹 안에서 바람비전 접속 > 메월 접속 > 등록순으로 재정렬한다.
    const orderedItems = sortByPrice
      ? result.items
      : result.items
          .map((listing, index) => ({
            listing,
            index,
            statusGroup: HOME_STATUS_GROUP[listing.status],
            presenceRank: this.resolvePresenceRank(
              listing,
              lastActiveByAccountId,
              mverseOnlineByTag,
            ),
          }))
          .sort((a, b) => {
            if (a.statusGroup !== b.statusGroup) {
              return a.statusGroup - b.statusGroup;
            }

            if (a.presenceRank !== b.presenceRank) {
              return a.presenceRank - b.presenceRank;
            }

            return a.index - b.index;
          })
          .map((entry) => entry.listing);

    const pageItems = orderedItems.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    const marketStatsByKey = await this.loadMarketStats(pageItems);

    const context: SerializeContext = {
      member,
      lastActiveByAccountId,
      mverseOnlineByTag,
      marketStatsByKey,
    };

    return {
      items: pageItems.map((listing) =>
        this.serializeListing(listing, context),
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      openCount: countByStatus.get('open') ?? 0,
      requestedCount: countByStatus.get('requested') ?? 0,
      activeTrade: activeTrade
        ? this.serializeListing(activeTrade, context)
        : null,
    };
  }

  async findListingDetail(
    id: string,
    member?: Member | null,
  ): Promise<TradeListingDetail> {
    const listing = await this.findListingById(id);
    const owner = await this.memberService.findByAccountId(
      listing.ownerAccountId,
    );
    const ownerListings = await this.tradeListingModel
      .find({
        ownerAccountId: listing.ownerAccountId,
        _id: { $ne: listing._id },
      })
      .sort({ createdAt: -1 })
      .limit(OWNER_LISTING_LIMIT)
      .exec();

    const lastActiveByAccountId = new Map<string, Date>();

    if (owner?.lastActiveAt != null) {
      lastActiveByAccountId.set(listing.ownerAccountId, owner.lastActiveAt);
    }

    const marketStatsByKey = await this.loadMarketStats([listing]);
    const threadsByListingId = member
      ? await this.buildThreadSummaries([listing], member)
      : undefined;
    const context: SerializeContext = {
      member,
      lastActiveByAccountId,
      marketStatsByKey,
      threadsByListingId,
    };

    // 바람의나라 닉네임은 거래 당사자(게시자/요청자)에게만 공개한다.
    const isParticipant =
      member != null &&
      (listing.ownerAccountId === member.accountId ||
        this.getPendingRequests(listing).some(
          (entry) => entry.requesterAccountId === member.accountId,
        ) ||
        listing.requesterAccountId === member.accountId);

    return {
      listing: this.serializeListing(listing, context),
      owner: {
        nickname: listing.ownerNickname,
        joinedAt: owner?.createdAt?.toISOString(),
        maplestoryWorldId: listing.ownerMaplestoryWorldId,
        baramNickname: isParticipant ? listing.ownerBaramNickname : undefined,
      },
      ownerListings: ownerListings.map((entry) =>
        this.serializeListing(entry, context),
      ),
    };
  }

  async getDyeOptions(): Promise<TradeDyeOptions> {
    const catalog = await this.loadItemCatalog();

    return {
      weaponDyes: catalog.etc
        .filter((item) => item.name.startsWith('무기염색약'))
        .map((item) => ({ itemId: item.id, name: item.name })),
      armorDyes: catalog.etc
        .filter((item) => item.name.includes('의상염색약'))
        .map((item) => ({ itemId: item.id, name: item.name })),
    };
  }

  async getItemPriceStats(itemId: number): Promise<TradeItemPriceStats> {
    // 옵션 차이로 가격이 달라지는 염색/형상변환 매물은 표본에서 제외한다.
    const listings = await this.tradeListingModel
      .find({
        itemId,
        status: 'completed',
        dyeItemId: null,
        transformItemId: null,
      })
      .sort({ closedAt: -1 })
      .limit(PRICE_STATS_SAMPLE_LIMIT)
      .select({ price: 1 })
      .lean()
      .exec();

    // 가격은 자유 문자열이므로 숫자(콤마 허용)로 적힌 거래만 집계한다.
    const numericPrices = listings
      .map((listing) => parseNumericPrice(listing.price))
      .filter((price): price is number => price != null);

    if (numericPrices.length === 0) {
      return { itemId, sampleCount: 0, averagePrice: null };
    }

    const total = numericPrices.reduce((sum, price) => sum + price, 0);

    return {
      itemId,
      sampleCount: numericPrices.length,
      averagePrice: Math.round(total / numericPrices.length),
    };
  }

  async getItemPriceSummaries(
    limit = PRICE_SUMMARY_DEFAULT_LIMIT,
  ): Promise<TradeItemPriceSummary[]> {
    // 가격이 자유 문자열이므로 최근 완료 거래를 가져와 숫자 가격만 앱에서 집계한다.
    // 옵션 차이로 가격이 달라지는 염색/형상변환 매물은 표본에서 제외한다.
    const listings = await this.tradeListingModel
      .find({
        status: 'completed',
        dyeItemId: null,
        transformItemId: null,
      })
      .sort({ closedAt: -1 })
      .limit(PRICE_SUMMARY_SCAN_LIMIT)
      .select({
        itemId: 1,
        itemName: 1,
        itemType: 1,
        price: 1,
        closedAt: 1,
        createdAt: 1,
      })
      .lean()
      .exec();

    const groups = new Map<
      number,
      {
        itemId: number;
        itemName: string;
        itemType?: TradeItemType;
        prices: number[];
        latestPrice: number;
        lastTradedAt: Date;
      }
    >();

    for (const listing of listings) {
      const price = parseNumericPrice(listing.price);

      if (price == null) {
        continue;
      }

      const group = groups.get(listing.itemId);

      if (!group) {
        // closedAt 내림차순 조회라 아이템별 첫 표본이 가장 최근 거래다.
        groups.set(listing.itemId, {
          itemId: listing.itemId,
          itemName: listing.itemName,
          itemType: listing.itemType,
          prices: [price],
          latestPrice: price,
          lastTradedAt: listing.closedAt ?? listing.createdAt,
        });
        continue;
      }

      if (group.prices.length < PRICE_STATS_SAMPLE_LIMIT) {
        group.prices.push(price);
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => b.lastTradedAt.getTime() - a.lastTradedAt.getTime())
      .slice(0, limit)
      .map((group) => ({
        itemId: group.itemId,
        itemName: group.itemName,
        itemType: group.itemType,
        sampleCount: group.prices.length,
        averagePrice: Math.round(
          group.prices.reduce((sum, price) => sum + price, 0) /
            group.prices.length,
        ),
        latestPrice: group.latestPrice,
        lastTradedAt: group.lastTradedAt.toISOString(),
      }));
  }

  // 시세보기 탭(주식형). 인기(체결 많은) 아이템별 평균 호가/평균 체결가/변동률을 모은다.
  // 옵션(염색/형상변환) 없는 완료/등록 매물 기준으로 집계한다.
  async getMarketOverview(
    limit = MARKET_OVERVIEW_DEFAULT_LIMIT,
  ): Promise<TradeMarketOverviewItem[]> {
    // 최근 완료 거래를 스캔해 아이템별로 묶는다(가격이 자유 문자열이라 앱에서 집계).
    const completedDocs = await this.tradeListingModel
      .find({ status: 'completed', dyeItemId: null, transformItemId: null })
      .sort({ closedAt: -1 })
      .limit(PRICE_SUMMARY_SCAN_LIMIT)
      .select({
        itemId: 1,
        itemName: 1,
        itemType: 1,
        price: 1,
        closedAt: 1,
        createdAt: 1,
      })
      .lean()
      .exec();

    const groups = new Map<
      number,
      {
        itemId: number;
        itemName: string;
        itemType?: TradeItemType;
        // closedAt 내림차순(최신 먼저)으로 쌓이는 가격
        prices: number[];
        lastTradedAt: Date;
      }
    >();

    for (const listing of completedDocs) {
      const price = parseNumericPrice(listing.price);

      if (price == null) {
        continue;
      }

      const group = groups.get(listing.itemId);

      if (!group) {
        groups.set(listing.itemId, {
          itemId: listing.itemId,
          itemName: listing.itemName,
          itemType: listing.itemType,
          prices: [price],
          lastTradedAt: listing.closedAt ?? listing.createdAt,
        });
        continue;
      }

      if (group.prices.length < PRICE_STATS_SAMPLE_LIMIT) {
        group.prices.push(price);
      }
    }

    // 인기 = 체결 표본이 많은 순, 동률이면 최근 거래순
    const topGroups = Array.from(groups.values())
      .sort((a, b) => {
        if (b.prices.length !== a.prices.length) {
          return b.prices.length - a.prices.length;
        }

        return b.lastTradedAt.getTime() - a.lastTradedAt.getTime();
      })
      .slice(0, limit);

    if (topGroups.length === 0) {
      return [];
    }

    // 상위 아이템의 현재 호가 평균/건수 (옵션 없는 등록·진행중 매물)
    const openStats = await this.tradeListingModel
      .aggregate<{ _id: number; avg: number; count: number }>([
        {
          $match: {
            itemId: { $in: topGroups.map((group) => group.itemId) },
            status: { $in: ['open', 'requested'] as TradeStatus[] },
            dyeItemId: null,
            transformItemId: null,
          },
        },
        {
          $addFields: {
            numericPrice: {
              $convert: {
                input: {
                  $replaceAll: {
                    input: { $trim: { input: '$price' } },
                    find: ',',
                    replacement: '',
                  },
                },
                to: 'double',
                onError: null,
                onNull: null,
              },
            },
          },
        },
        { $match: { numericPrice: { $gt: 0 } } },
        {
          $group: {
            _id: '$itemId',
            avg: { $avg: '$numericPrice' },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const openByItem = new Map(openStats.map((entry) => [entry._id, entry]));

    return topGroups.map((group) => {
      const open = openByItem.get(group.itemId);
      // prices는 최신→과거 순. 스파크라인/추이는 과거→최신으로 뒤집어 쓴다.
      const chronological = [...group.prices].reverse();
      const average = Math.round(
        group.prices.reduce((sum, price) => sum + price, 0) /
          group.prices.length,
      );

      return {
        itemId: group.itemId,
        itemName: group.itemName,
        itemType: group.itemType,
        openAveragePrice: open ? Math.round(open.avg) : null,
        openCount: open?.count ?? 0,
        completedAveragePrice: average,
        latestPrice: group.prices[0],
        sampleCount: group.prices.length,
        lastTradedAt: group.lastTradedAt.toISOString(),
        changeRate: this.computeChangeRate(chronological),
        spark: chronological.slice(-MARKET_OVERVIEW_SPARK_POINTS),
      };
    });
  }

  // 거래 상세 꺾은선 그래프용 체결가 추이. 같은 옵션(염색/형상변환) 기준으로 모은다.
  async getPriceHistory(query: {
    itemId: number;
    dyeItemId?: number;
    transformItemId?: number;
    days?: number;
  }): Promise<TradePriceHistory> {
    const { itemId } = query;
    const days = query.days ?? PRICE_HISTORY_DEFAULT_DAYS;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const docs = await this.tradeListingModel
      .find({
        itemId,
        status: 'completed',
        dyeItemId: query.dyeItemId ?? null,
        transformItemId: query.transformItemId ?? null,
        closedAt: { $gte: since },
      })
      .sort({ closedAt: 1 })
      .limit(PRICE_HISTORY_MAX_POINTS)
      .select({ price: 1, closedAt: 1, createdAt: 1 })
      .lean()
      .exec();

    const points: TradePricePoint[] = [];

    for (const doc of docs) {
      const price = parseNumericPrice(doc.price);
      const closedAt = doc.closedAt ?? doc.createdAt;

      if (price == null || closedAt == null) {
        continue;
      }

      points.push({ closedAt: new Date(closedAt).toISOString(), price });
    }

    if (points.length === 0) {
      return {
        itemId,
        dyeItemId: query.dyeItemId,
        transformItemId: query.transformItemId,
        points,
        averagePrice: null,
        minPrice: null,
        maxPrice: null,
        changeRate: null,
      };
    }

    const prices = points.map((point) => point.price);
    const total = prices.reduce((sum, price) => sum + price, 0);
    const first = prices[0];
    const last = prices[prices.length - 1];

    return {
      itemId,
      dyeItemId: query.dyeItemId,
      transformItemId: query.transformItemId,
      points,
      averagePrice: Math.round(total / prices.length),
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      changeRate: first > 0 ? (last - first) / first : null,
    };
  }

  // 체결가 추이(과거→최신)에서 앞 절반 대비 뒤 절반 평균의 변동률. 표본 2건 미만이면 null.
  private computeChangeRate(chronological: number[]): number | null {
    if (chronological.length < 2) {
      return null;
    }

    const mid = Math.floor(chronological.length / 2);
    const older = chronological.slice(0, mid);
    const recent = chronological.slice(mid);
    const avg = (list: number[]) =>
      list.reduce((sum, price) => sum + price, 0) / list.length;
    const olderAvg = avg(older);

    if (olderAvg <= 0) {
      return null;
    }

    return (avg(recent) - olderAvg) / olderAvg;
  }

  // 같은 아이템·옵션의 현재 등록 매물(호가)과 최근 거래완료(체결가)를 나눠 돌려준다.
  // 가격 판단 근거 제공용. 염색/형상변환이 지정되면 동일 옵션끼리, 미지정이면
  // 옵션 없는 표본끼리 비교한다(getItemPriceStats의 표본 규칙과 일치).
  async getItemMarket(
    query: QueryTradeItemMarketDto,
  ): Promise<TradeItemMarket> {
    const { itemId } = query;
    const optionFilter = {
      dyeItemId: query.dyeItemId ?? null,
      transformItemId: query.transformItemId ?? null,
    };
    const openStatus = { $in: ['open', 'requested'] as TradeStatus[] };

    const [openDocs, completedDocs, openCount, completedCount] =
      await Promise.all([
        // 표본이 작아(최대 MARKET_LIST_LIMIT건) 하이드레이트 비용이 미미하므로 lean을 쓰지 않는다.
        this.tradeListingModel
          .find({ itemId, status: openStatus, ...optionFilter })
          .sort({ createdAt: -1 })
          .limit(MARKET_LIST_LIMIT)
          .exec(),
        this.tradeListingModel
          .find({ itemId, status: 'completed', ...optionFilter })
          .sort({ closedAt: -1 })
          .limit(MARKET_LIST_LIMIT)
          .exec(),
        this.tradeListingModel
          .countDocuments({ itemId, status: openStatus, ...optionFilter })
          .exec(),
        this.tradeListingModel
          .countDocuments({ itemId, status: 'completed', ...optionFilter })
          .exec(),
      ]);

    const open = openDocs.map((doc) => this.toMarketEntry(doc));
    const completed = completedDocs.map((doc) => this.toMarketEntry(doc));

    return {
      itemId,
      dyeItemId: query.dyeItemId,
      transformItemId: query.transformItemId,
      open,
      openCount,
      openAveragePrice: this.averageNumericPrice(open),
      completed,
      completedCount,
      completedAveragePrice: this.averageNumericPrice(completed),
    };
  }

  private toMarketEntry(listing: TradeListing): TradeItemMarketEntry {
    return {
      id: String(listing._id),
      type: listing.type,
      status: listing.status,
      price: listing.price,
      numericPrice: parseNumericPrice(listing.price),
      quantity: listing.quantity,
      durability: listing.durability,
      dyeItemId: listing.dyeItemId,
      dyeName: listing.dyeName,
      transformItemId: listing.transformItemId,
      transformItemName: listing.transformItemName,
      // 시세 패널은 공개 신원(메월 닉네임)만 노출한다.
      ownerNickname: listing.ownerNickname,
      createdAt: listing.createdAt.toISOString(),
      closedAt: listing.closedAt?.toISOString(),
    };
  }

  // 숫자(콤마 허용)로 적힌 가격만 모아 평균을 낸다. 표본이 없으면 null.
  private averageNumericPrice(entries: TradeItemMarketEntry[]): number | null {
    const prices = entries
      .map((entry) => entry.numericPrice)
      .filter((price): price is number => price != null);

    if (prices.length === 0) {
      return null;
    }

    return Math.round(
      prices.reduce((sum, price) => sum + price, 0) / prices.length,
    );
  }

  async createListing(
    member: Member,
    dto: CreateTradeListingDto,
  ): Promise<SerializedTradeListing> {
    this.assertHasContact(member);
    await this.memberService.assertVerifiedMverseProfile(member);
    this.assertHasBaramNickname(member);

    // 거래 등록 게시물은 진행 중 기준 최대 5개로 제한한다.
    const activeCount = await this.tradeListingModel
      .countDocuments({
        ownerAccountId: member.accountId,
        status: { $in: ['open', 'requested'] },
      })
      .exec();

    if (activeCount >= ACTIVE_LISTING_LIMIT) {
      throw new BadRequestException(
        `거래 게시글은 동시에 ${ACTIVE_LISTING_LIMIT}개까지만 등록할 수 있습니다. 기존 거래를 완료하거나 취소하세요.`,
      );
    }

    const itemName = dto.itemName.trim();
    const itemType = await this.resolveItemType(
      dto.itemId,
      itemName,
      dto.itemType,
    );
    const isEquip = EQUIP_ITEM_TYPES.includes(itemType);
    const isDyeable = DYEABLE_ITEM_TYPES.includes(itemType);
    const isTransformable = TRANSFORMABLE_ITEM_TYPES.includes(itemType);

    // 무기는 무기염색약, 갑옷은 의상염색약을 쓴다. 코스튬은 덮는 장비
    // 슬롯(baseType)에 따라 무기/의상 염색약이 갈린다.
    let usesWeaponDye = itemType === 'w';

    if (itemType === 'c') {
      const costumeItem = (await this.loadItemCatalog()).costume.find(
        (entry) => entry.id === dto.itemId || entry.name === itemName,
      );
      usesWeaponDye = costumeItem?.baseType === 'w';
    }

    let dye: TradeDyeOption | undefined;

    if (isDyeable && dto.dyeItemId != null) {
      const options = await this.getDyeOptions();
      const pool = usesWeaponDye ? options.weaponDyes : options.armorDyes;
      dye = pool.find((entry) => entry.itemId === dto.dyeItemId);

      if (!dye) {
        throw new BadRequestException(
          '선택한 염색약을 이 아이템에 적용할 수 없습니다.',
        );
      }
    }

    let transformItem: CatalogItem | undefined;

    if (isTransformable && dto.transformItemId != null) {
      const catalog = await this.loadItemCatalog();
      transformItem = catalog.equip.find(
        (entry) => entry.id === dto.transformItemId && entry.type === itemType,
      );

      if (!transformItem) {
        throw new BadRequestException(
          '형상변환 대상 아이템을 찾을 수 없습니다.',
        );
      }
    }

    const listing = new this.tradeListingModel({
      type: dto.type,
      status: 'open',
      itemId: dto.itemId,
      itemName,
      itemType,
      price: dto.price.trim(),
      quantity: dto.quantity,
      durability: isEquip ? (dto.durability ?? 100) : undefined,
      dyeItemId: dye?.itemId,
      dyeName: dye?.name,
      transformItemId: transformItem?.id,
      transformItemName: transformItem?.name,
      memo: dto.memo?.trim(),
      ownerAccountId: member.accountId,
      // 공개 노출 닉네임은 메월 프로필명(+태그). 바람 닉네임은 따로 저장해 둔다.
      ownerNickname: this.resolvePublicNickname(member),
      ownerDiscordId: member.discordId,
      ownerEmail: member.email,
      ownerMaplestoryWorldId: member.maplestoryWorldId,
      ownerBaramNickname: member.baramNickname,
      requests: [],
    });

    await listing.save();

    return this.serializeListing(listing, { member });
  }

  async requestTrade(
    id: string,
    member: Member,
    message?: string,
  ): Promise<SerializedTradeListing> {
    await this.memberService.assertVerifiedMverseProfile(member);
    this.assertHasBaramNickname(member);

    const listing = await this.findListingById(id);

    if (listing.status === 'completed' || listing.status === 'canceled') {
      throw new BadRequestException('이미 종료된 거래입니다.');
    }

    if (listing.ownerAccountId === member.accountId) {
      throw new BadRequestException(
        '내가 등록한 게시글에는 거래 요청을 보낼 수 없습니다.',
      );
    }

    const requests = this.getPendingRequests(listing);

    if (
      requests.some((entry) => entry.requesterAccountId === member.accountId)
    ) {
      throw new BadRequestException('이미 이 게시글에 거래 요청을 보냈습니다.');
    }

    if (requests.length >= LISTING_REQUEST_LIMIT) {
      throw new BadRequestException('이 게시글의 거래 요청이 가득 찼습니다.');
    }

    // 동시에 보낼 수 있는 요청 수 제한
    const outgoingCount = await this.tradeListingModel
      .countDocuments({
        status: 'requested',
        'requests.requesterAccountId': member.accountId,
      })
      .exec();

    if (outgoingCount >= ACTIVE_REQUEST_LIMIT) {
      throw new BadRequestException(
        `거래 요청은 동시에 ${ACTIVE_REQUEST_LIMIT}건까지만 보낼 수 있습니다. 기존 요청을 정리하세요.`,
      );
    }

    const entry: TradeRequestEntry = {
      requesterAccountId: member.accountId,
      // 공개 노출 닉네임은 메월 프로필명(+태그). 바람 닉네임은 따로 보관한다.
      requesterNickname: this.resolvePublicNickname(member),
      requesterDiscordId: member.discordId,
      requesterEmail: member.email,
      requesterMaplestoryWorldId: member.maplestoryWorldId,
      requesterBaramNickname: member.baramNickname,
      requestedAt: new Date(),
    };

    listing.requests = [...requests, entry];
    listing.status = 'requested';
    listing.requestedAt = listing.requestedAt ?? entry.requestedAt;

    await listing.save();

    // 요청과 함께 첫 메모를 보냈다면 해당 스레드의 첫 메시지로 저장한다.
    const firstMessage = message?.trim().slice(0, REQUEST_MESSAGE_MAX_LENGTH);

    if (firstMessage) {
      // 요청 알림이 곧 발송되므로 메모 알림은 보내지 않고(suppressNotify)
      // 게시자 푸시 스로틀 기준점만 갱신해 둔다(중복 푸시 방지).
      await this.appendThreadMessage(listing, member, firstMessage, {
        suppressNotify: true,
        markRecipientPushed: true,
      }).catch(() => undefined);
    }

    // 게시자에게 SSE/웹푸시 알림 (실패해도 거래 흐름을 막지 않는다)
    void this.notificationService
      .notifyTradeRequest(listing.ownerAccountId, {
        listingId: String(listing._id),
        itemName: listing.itemName,
        price: listing.price,
        // 게시자 알림은 거래 당사자가 알아볼 바람의나라 닉네임으로 표기한다.
        requesterNickname:
          entry.requesterBaramNickname ?? entry.requesterNickname,
        messagePreview: firstMessage
          ? this.buildPreview(firstMessage)
          : undefined,
        // 게시자는 요청자의 스레드를 바로 여는 딥링크로 이동한다.
        url: this.buildThreadUrl(listing, true, member.accountId),
      })
      .catch(() => undefined);

    return this.serializeListing(listing, { member });
  }

  async updateStatus(
    id: string,
    member: Member,
    status: TradeResolveStatusDto,
    requesterAccountId?: string,
  ): Promise<SerializedTradeListing> {
    const listing = await this.findListingById(id);

    // 거래 완료/게시 취소 판정은 게시자만 할 수 있다.
    // (요청자는 releaseRequest로 자신의 요청만 취소할 수 있다)
    if (listing.ownerAccountId !== member.accountId) {
      throw new ForbiddenException('게시자만 거래 상태를 변경할 수 있습니다.');
    }

    if (listing.status !== 'open' && listing.status !== 'requested') {
      throw new BadRequestException('이미 종료된 거래입니다.');
    }

    if (status === TradeResolveStatusDto.Completed) {
      const requests = this.getPendingRequests(listing);

      if (requests.length === 0) {
        throw new BadRequestException(
          '거래 요청이 없는 게시글은 완료 처리할 수 없습니다.',
        );
      }

      // 거래 상대 선택: 요청이 1건이면 자동, 여러 건이면 명시적으로 골라야 한다.
      let selected: TradeRequestEntry | undefined;

      if (requesterAccountId) {
        selected = requests.find(
          (entry) => entry.requesterAccountId === requesterAccountId,
        );

        if (!selected) {
          throw new BadRequestException(
            '선택한 요청자를 이 게시글에서 찾을 수 없습니다.',
          );
        }
      } else if (requests.length === 1) {
        selected = requests[0];
      } else {
        throw new BadRequestException(
          '거래 요청자가 여러 명입니다. 거래한 상대를 선택하세요.',
        );
      }

      listing.requesterAccountId = selected.requesterAccountId;
      // 공개 노출은 메월 닉네임(+태그), 바람 닉네임은 당사자에게만 따로 승격한다.
      listing.requesterNickname = selected.requesterNickname;
      listing.requesterMaplestoryWorldId = selected.requesterMaplestoryWorldId;
      listing.requesterBaramNickname = selected.requesterBaramNickname;
      listing.requesterDiscordId = selected.requesterDiscordId;
      listing.requesterEmail = selected.requesterEmail;
      listing.requestedAt = selected.requestedAt;
    }

    listing.status = status as TradeStatus;
    listing.closedAt = new Date();

    await listing.save();

    return this.serializeListing(listing, { member });
  }

  /**
   * 거래 요청 철회/거절.
   * - 요청자 본인: 자신의 요청을 취소한다.
   * - 게시자: requesterAccountId로 특정 요청을 거절한다.
   * 남은 요청이 없으면 게시글은 다시 거래 가능(open) 상태가 된다.
   */
  async releaseRequest(
    id: string,
    member: Member,
    requesterAccountId?: string,
  ): Promise<SerializedTradeListing> {
    const listing = await this.findListingById(id);

    if (listing.status !== 'requested') {
      throw new BadRequestException('진행 중인 거래 요청이 없습니다.');
    }

    const requests = this.getPendingRequests(listing);
    const isOwner = listing.ownerAccountId === member.accountId;

    let targetAccountId: string;

    if (isOwner) {
      if (requesterAccountId) {
        targetAccountId = requesterAccountId;
      } else if (requests.length === 1) {
        targetAccountId = requests[0].requesterAccountId;
      } else {
        throw new BadRequestException('거절할 거래 요청자를 선택하세요.');
      }
    } else {
      targetAccountId = member.accountId;
    }

    const target = requests.find(
      (entry) => entry.requesterAccountId === targetAccountId,
    );

    if (!target) {
      throw new ForbiddenException('이 거래 요청을 변경할 수 없습니다.');
    }

    listing.requests = requests.filter(
      (entry) => entry.requesterAccountId !== targetAccountId,
    );

    // 다중 요청 도입 전 단일 요청자 필드 정리
    if (listing.requesterAccountId === targetAccountId) {
      listing.requesterAccountId = undefined;
      listing.requesterNickname = undefined;
      listing.requesterMaplestoryWorldId = undefined;
      listing.requesterBaramNickname = undefined;
      listing.requesterDiscordId = undefined;
      listing.requesterEmail = undefined;
    }

    if (listing.requests.length === 0) {
      listing.status = 'open';
      listing.requestedAt = undefined;
    }

    await listing.save();

    return this.serializeListing(listing, { member });
  }

  async findMyTrades(member: Member): Promise<MyTradesResult> {
    const sortStages = [
      {
        $addFields: {
          statusOrder: { $indexOfArray: [STATUS_SORT_ORDER, '$status'] },
        },
      },
      { $sort: { statusOrder: 1 as const, createdAt: -1 as const } },
      { $limit: MY_TRADES_LIMIT },
    ];

    const [listings, requests] = await Promise.all([
      this.tradeListingModel
        .aggregate<TradeListing>([
          { $match: { ownerAccountId: member.accountId } },
          ...sortStages,
        ])
        .exec(),
      this.tradeListingModel
        .aggregate<TradeListing>([
          {
            $match: {
              $or: [
                { 'requests.requesterAccountId': member.accountId },
                { requesterAccountId: member.accountId },
              ],
            },
          },
          ...sortStages,
        ])
        .exec(),
    ]);

    const threadsByListingId = await this.buildThreadSummaries(
      [...listings, ...requests],
      member,
    );
    const context: SerializeContext = { member, threadsByListingId };

    return {
      listings: listings.map((listing) =>
        this.serializeListing(listing, context),
      ),
      requests: requests.map((listing) =>
        this.serializeListing(listing, context),
      ),
    };
  }

  // 게시자-요청자 메모 대화 조회. 게시자는 모든 스레드, 요청자는 자기 스레드만.
  // 조회한 호출자의 읽음 기준점을 갱신하고 안읽음 수를 0으로 만든다.
  async findMessages(
    id: string,
    member: Member,
    thread?: string,
  ): Promise<{
    thread: string;
    messages: SerializedTradeMessage[];
    // 상대가 지금 같은 대화방을 보고 있는지(최근 조회/폴링 기준)
    opponentViewing: boolean;
    opponentLastSeenAt?: string;
  }> {
    const listing = await this.findListingById(id);
    const threadAccountId = this.resolveMessageThread(listing, member, thread);

    const messages = await this.tradeMessageModel
      .find({ listingId: listing._id, threadAccountId })
      .sort({ createdAt: 1 })
      .limit(TRADE_MESSAGE_LIMIT)
      .exec();

    await this.markThreadRead(listing, threadAccountId, member.accountId);

    // 상대의 마지막 조회 시각으로 대화 참여(보고 있음) 여부를 판단한다.
    // 호출자가 게시자면 상대는 요청자, 요청자면 상대는 게시자다.
    const isOwner = listing.ownerAccountId === member.accountId;
    const threadDoc = await this.tradeThreadModel
      .findOne({ listingId: listing._id, threadAccountId })
      .select({ ownerLastReadAt: 1, requesterLastReadAt: 1 })
      .lean()
      .exec();
    const opponentLastReadAt = isOwner
      ? threadDoc?.requesterLastReadAt
      : threadDoc?.ownerLastReadAt;
    const opponentViewing =
      opponentLastReadAt != null &&
      Date.now() - new Date(opponentLastReadAt).getTime() <=
        THREAD_PRESENCE_WINDOW_MS;

    return {
      thread: threadAccountId,
      opponentViewing,
      opponentLastSeenAt: opponentLastReadAt
        ? new Date(opponentLastReadAt).toISOString()
        : undefined,
      messages: messages.map((message) => ({
        id: String(message._id),
        threadAccountId: message.threadAccountId,
        authorAccountId: message.authorAccountId,
        authorNickname: message.authorNickname,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        isMine: message.authorAccountId === member.accountId,
      })),
    };
  }

  async createMessage(
    id: string,
    member: Member,
    content: string,
    thread?: string,
  ): Promise<{ thread: string; message: SerializedTradeMessage }> {
    const listing = await this.findListingById(id);
    const trimmed = content.trim();

    if (!trimmed) {
      throw new BadRequestException('메시지를 입력하세요.');
    }

    // 종료된 거래에서는 대화를 닫는다. (기록 조회는 계속 가능)
    if (listing.status === 'completed' || listing.status === 'canceled') {
      throw new BadRequestException(
        '종료된 거래에서는 대화를 보낼 수 없습니다.',
      );
    }

    return this.appendThreadMessage(listing, member, trimmed, { thread });
  }

  // 전역 안읽음 메모 합계 (헤더 배지용). 게시자/요청자 양쪽을 더한다.
  async getUnreadSummary(member: Member): Promise<TradeUnreadSummary> {
    const threads = await this.tradeThreadModel
      .find({
        $or: [
          { ownerAccountId: member.accountId, ownerUnread: { $gt: 0 } },
          { threadAccountId: member.accountId, requesterUnread: { $gt: 0 } },
        ],
      })
      .select({ ownerAccountId: 1, ownerUnread: 1, requesterUnread: 1 })
      .lean()
      .exec();

    let total = 0;

    for (const thread of threads) {
      total +=
        thread.ownerAccountId === member.accountId
          ? (thread.ownerUnread ?? 0)
          : (thread.requesterUnread ?? 0);
    }

    return { total, threadCount: threads.length };
  }

  // 메모 본문 미리보기. 줄바꿈은 공백으로 펴고 길이를 제한한다.
  private buildPreview(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();

    return normalized.length > MESSAGE_PREVIEW_LENGTH
      ? `${normalized.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
      : normalized;
  }

  // 알림 클릭 딥링크. 게시자는 요청자 스레드를 바로 여는 ?thread= 링크로,
  // 요청자는 자기 스레드가 자동으로 열리는 상세 페이지로 보낸다.
  private buildThreadUrl(
    listing: TradeListing,
    isOwnerView: boolean,
    threadAccountId: string,
  ): string {
    const base = `/trade/${String(listing._id)}`;

    return isOwnerView
      ? `${base}?thread=${encodeURIComponent(threadAccountId)}`
      : base;
  }

  // 대화방을 조회한 호출자의 읽음 처리. 스레드 문서가 있을 때만 갱신한다.
  private async markThreadRead(
    listing: TradeListing,
    threadAccountId: string,
    readerAccountId: string,
  ): Promise<void> {
    const isOwner = listing.ownerAccountId === readerAccountId;
    const update = isOwner
      ? { ownerUnread: 0, ownerLastReadAt: new Date() }
      : { requesterUnread: 0, requesterLastReadAt: new Date() };

    await this.tradeThreadModel
      .updateOne({ listingId: listing._id, threadAccountId }, { $set: update })
      .exec()
      .catch(() => undefined);
  }

  /**
   * 메모 한 건을 저장하고 대화방 요약(trade_threads)을 upsert한다.
   * 수신자의 안읽음 수를 올리고, 5분 스로틀에 맞춰 SSE/웹푸시를 보낸다.
   * (요청 첫 메모는 요청 알림과 중복되므로 suppressNotify로 알림을 건너뛴다)
   */
  private async appendThreadMessage(
    listing: TradeListing,
    author: Member,
    content: string,
    options?: {
      thread?: string;
      suppressNotify?: boolean;
      markRecipientPushed?: boolean;
    },
  ): Promise<{ thread: string; message: SerializedTradeMessage }> {
    const threadAccountId = this.resolveMessageThread(
      listing,
      author,
      options?.thread,
    );
    const now = new Date();
    // 대화 본문에는 거래 당사자가 게임에서 알아볼 바람의나라 닉네임을 쓴다.
    const authorNickname = this.resolveConversationNickname(author);

    const message = new this.tradeMessageModel({
      listingId: listing._id,
      threadAccountId,
      authorAccountId: author.accountId,
      authorNickname,
      content,
      createdAt: now,
    });

    await message.save();

    const isAuthorOwner = listing.ownerAccountId === author.accountId;
    const recipientAccountId = isAuthorOwner
      ? threadAccountId
      : listing.ownerAccountId;

    // 작성자 기준 상대(수신자)의 안읽음 필드 / 푸시 기준점 필드
    const recipientUnreadField = isAuthorOwner
      ? 'requesterUnread'
      : 'ownerUnread';
    const recipientPushedField = isAuthorOwner
      ? 'requesterLastPushedAt'
      : 'ownerLastPushedAt';
    const authorUnreadField = isAuthorOwner ? 'ownerUnread' : 'requesterUnread';
    const authorReadField = isAuthorOwner
      ? 'ownerLastReadAt'
      : 'requesterLastReadAt';

    const existing = await this.tradeThreadModel
      .findOne({ listingId: listing._id, threadAccountId })
      .select({ ownerLastPushedAt: 1, requesterLastPushedAt: 1 })
      .lean()
      .exec();

    const recipientLastPushedAt = isAuthorOwner
      ? existing?.requesterLastPushedAt
      : existing?.ownerLastPushedAt;

    const shouldPush =
      !options?.suppressNotify &&
      (recipientLastPushedAt == null ||
        now.getTime() - new Date(recipientLastPushedAt).getTime() >=
          MESSAGE_PUSH_THROTTLE_MS);

    const set: Record<string, unknown> = {
      ownerAccountId: listing.ownerAccountId,
      lastMessageAt: now,
      lastMessagePreview: this.buildPreview(content),
      lastAuthorAccountId: author.accountId,
      // 작성자는 자기 메시지를 보냈으므로 자기 스레드를 읽은 것으로 본다.
      [authorUnreadField]: 0,
      [authorReadField]: now,
    };

    if (shouldPush || options?.markRecipientPushed) {
      set[recipientPushedField] = now;
    }

    await this.tradeThreadModel
      .updateOne(
        { listingId: listing._id, threadAccountId },
        { $set: set, $inc: { [recipientUnreadField]: 1 } },
        { upsert: true },
      )
      .exec();

    if (!options?.suppressNotify) {
      void this.notificationService
        .notifyTradeMessage(
          recipientAccountId,
          {
            listingId: String(listing._id),
            thread: threadAccountId,
            itemName: listing.itemName,
            authorNickname,
            preview: this.buildPreview(content),
            // 수신자가 게시자면 요청자 스레드 딥링크, 요청자면 상세로 보낸다.
            url: this.buildThreadUrl(listing, !isAuthorOwner, threadAccountId),
          },
          { sendPush: shouldPush },
        )
        .catch(() => undefined);
    }

    return {
      thread: threadAccountId,
      message: {
        id: String(message._id),
        threadAccountId,
        authorAccountId: message.authorAccountId,
        authorNickname: message.authorNickname,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        isMine: true,
      },
    };
  }

  // 게시글들에 대해 호출자가 볼 수 있는 메모 대화방 요약을 일괄 구성한다.
  private async buildThreadSummaries(
    listings: TradeListing[],
    member: Member,
  ): Promise<Map<string, SerializedTradeThread[]>> {
    const result = new Map<string, SerializedTradeThread[]>();

    if (listings.length === 0) {
      return result;
    }

    const listingIds = listings.map((listing) => listing._id);
    const threads = await this.tradeThreadModel
      .find({ listingId: { $in: listingIds } })
      .lean()
      .exec();

    // listingId(string) → threadAccountId → thread doc
    const threadsByListing = new Map<string, Map<string, TradeThread>>();

    for (const thread of threads) {
      const key = String(thread.listingId);
      const inner = threadsByListing.get(key) ?? new Map<string, TradeThread>();
      inner.set(thread.threadAccountId, thread as unknown as TradeThread);
      threadsByListing.set(key, inner);
    }

    for (const listing of listings) {
      const listingKey = String(listing._id);
      const isOwner = listing.ownerAccountId === member.accountId;
      const threadDocs = threadsByListing.get(listingKey);
      const summaries: SerializedTradeThread[] = [];

      if (isOwner) {
        // 게시자: 요청자별 스레드. 요청 목록(+완료 상대)을 기준으로 만든다.
        const participants = new Map<string, string>();

        for (const entry of this.getPendingRequests(listing)) {
          participants.set(
            entry.requesterAccountId,
            entry.requesterBaramNickname ?? entry.requesterNickname,
          );
        }

        if (
          listing.requesterAccountId != null &&
          listing.requesterNickname != null
        ) {
          // 대화 탭 라벨은 바람의나라 닉네임으로 노출한다(당사자 맥락).
          participants.set(
            listing.requesterAccountId,
            listing.requesterBaramNickname ?? listing.requesterNickname,
          );
        }

        for (const [requesterAccountId, nickname] of participants) {
          const doc = threadDocs?.get(requesterAccountId);
          summaries.push(
            this.toThreadSummary(requesterAccountId, nickname, doc, true),
          );
        }
      } else {
        // 요청자: 자기 스레드 1개. 상대는 게시자.
        const requests = this.getPendingRequests(listing);
        const isParticipant =
          requests.some(
            (entry) => entry.requesterAccountId === member.accountId,
          ) || listing.requesterAccountId === member.accountId;

        if (isParticipant) {
          const doc = threadDocs?.get(member.accountId);
          summaries.push(
            this.toThreadSummary(
              member.accountId,
              listing.ownerBaramNickname ?? listing.ownerNickname,
              doc,
              false,
            ),
          );
        }
      }

      if (summaries.length > 0) {
        // 최근 메시지가 있는 스레드를 위로 정렬한다.
        summaries.sort((a, b) => {
          const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
          const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
          return bt - at;
        });
        result.set(listingKey, summaries);
      }
    }

    return result;
  }

  private toThreadSummary(
    threadAccountId: string,
    nickname: string,
    doc: TradeThread | undefined,
    isOwnerView: boolean,
  ): SerializedTradeThread {
    return {
      threadAccountId,
      nickname,
      unreadCount: doc
        ? ((isOwnerView ? doc.ownerUnread : doc.requesterUnread) ?? 0)
        : 0,
      lastMessageAt: doc?.lastMessageAt
        ? new Date(doc.lastMessageAt).toISOString()
        : undefined,
      lastMessagePreview: doc?.lastMessagePreview,
    };
  }

  private buildListingFilter(
    query: QueryTradeListingsDto,
  ): FilterQuery<TradeListing> {
    const filter: FilterQuery<TradeListing> = {};

    if (query.type) {
      filter.type = query.type;
    }

    if (query.itemType === 'etc') {
      // 장비·코스튬 외 전부. 타입 도입 이전(미저장) 게시글도 기타로 취급한다.
      filter.itemType = { $nin: [...EQUIP_ITEM_TYPES, 'c'] };
    } else if (query.itemType) {
      filter.itemType = query.itemType;
    }

    if (query.minDurability != null) {
      filter.durability = { $gte: query.minDurability };
    }

    if (query.dyeItemId != null) {
      filter.dyeItemId = query.dyeItemId;
    }

    if (query.transformItemId != null) {
      filter.transformItemId = query.transformItemId;
    }

    const search = query.search?.trim();

    if (search) {
      // 바람의나라 닉네임은 비공개이므로 검색 대상에서 제외한다.
      const regex = new RegExp(escapeRegExp(search), 'i');
      filter.$or = [{ itemName: regex }, { ownerNickname: regex }];
    }

    return filter;
  }

  // 아이템 타입은 클라이언트 입력 대신 아이템 도감에서 역으로 찾는다.
  // (도감에 없는 이름이면 클라이언트 값으로 폴백)
  private async resolveItemType(
    itemId: number,
    itemName: string,
    fallback: TradeItemType,
  ): Promise<TradeItemType> {
    const catalog = await this.loadItemCatalog();
    // 코스튬은 과거 etc(type 't')에 중복 적재돼 있을 수 있으므로 etc보다 먼저
    // 조회해, 같은 이름/ID라도 코스튬(type 'c')으로 해석되게 한다.
    const matched =
      catalog.equip.find((entry) => entry.name === itemName) ??
      catalog.costume.find((entry) => entry.name === itemName) ??
      catalog.etc.find((entry) => entry.name === itemName) ??
      catalog.equip.find((entry) => entry.id === itemId) ??
      catalog.costume.find((entry) => entry.id === itemId) ??
      catalog.etc.find((entry) => entry.id === itemId);

    return (matched?.type as TradeItemType | undefined) ?? fallback;
  }

  private async loadItemCatalog(): Promise<{
    equip: CatalogItem[];
    etc: CatalogItem[];
    costume: CatalogItem[];
  }> {
    const now = Date.now();

    if (
      this.itemCatalogCache &&
      now - this.itemCatalogCache.loadedAt < ITEM_CATALOG_TTL_MS
    ) {
      return this.itemCatalogCache;
    }

    const itemDoc = await this.itemModel.findOne().exec();
    this.itemCatalogCache = {
      loadedAt: now,
      equip: (itemDoc?.equip ?? []).map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
      })),
      etc: (itemDoc?.etc ?? []).map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
      })),
      costume: (itemDoc?.costume ?? []).map((entry) => ({
        id: entry.id,
        name: entry.name,
        type: entry.type,
        baseType: entry.baseType,
      })),
    };

    return this.itemCatalogCache;
  }

  // 내 진행 중 거래 1건: 내가 게시자이거나 요청자로 참여한 requested 게시글
  private async findActiveTrade(member: Member): Promise<TradeListing | null> {
    return this.tradeListingModel
      .findOne({
        status: 'requested',
        $or: [
          { ownerAccountId: member.accountId },
          { 'requests.requesterAccountId': member.accountId },
          { requesterAccountId: member.accountId },
        ],
      })
      .exec();
  }

  // 다중 요청 도입 전 단일 요청자 데이터를 요청 목록 형태로 정규화한다.
  private getPendingRequests(listing: TradeListing): TradeRequestEntry[] {
    if (listing.requests != null && listing.requests.length > 0) {
      return listing.requests;
    }

    if (
      listing.status === 'requested' &&
      listing.requesterAccountId != null &&
      listing.requesterNickname != null
    ) {
      return [
        {
          requesterAccountId: listing.requesterAccountId,
          requesterNickname: listing.requesterNickname,
          requesterDiscordId: listing.requesterDiscordId,
          requesterEmail: listing.requesterEmail,
          requesterMaplestoryWorldId: listing.requesterMaplestoryWorldId,
          requesterBaramNickname: listing.requesterBaramNickname,
          requestedAt: listing.requestedAt ?? listing.createdAt,
        },
      ];
    }

    return [];
  }

  // 거래소 공개 신원에 쓰는 닉네임. 메이플스토리월드 프로필명을 우선한다.
  // FE에서 maplestoryWorldId(태그)와 합쳐 "닉네임#태그"로 노출하며,
  // 바람의나라 닉네임은 거래 당사자(요청 이후)에게만 따로 공개한다.
  private resolvePublicNickname(member: Member): string {
    return (
      member.maplestoryWorldProfileName ?? member.nickname ?? member.accountId
    );
  }

  // 메모 대화에 쓰는 닉네임. 거래 당사자끼리는 게임에서 만나야 하므로
  // 바람의나라 닉네임을 우선한다. (대화는 참여자에게만 노출되는 맥락)
  private resolveConversationNickname(member: Member): string {
    return (
      member.baramNickname ??
      member.maplestoryWorldProfileName ??
      member.nickname ??
      member.accountId
    );
  }

  // 거래 연락 수단(디스코드 ID 또는 이메일)이 하나는 있어야 게시할 수 있다.
  private assertHasContact(member: Member): void {
    if (!member.discordId && !member.email) {
      throw new BadRequestException(
        '거래 연락에 사용할 디스코드 ID 또는 이메일이 계정에 없습니다.',
      );
    }
  }

  private assertHasBaramNickname(member: Member): void {
    if (!member.baramNickname) {
      throw new BadRequestException(
        '거래소 이용을 위해 내 정보에서 바람의나라 닉네임을 먼저 등록하세요.',
      );
    }
  }

  private async findListingById(id: string): Promise<TradeListing> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('거래 게시글을 찾을 수 없습니다.');
    }

    const listing = await this.tradeListingModel.findById(id).exec();

    if (!listing) {
      throw new NotFoundException('거래 게시글을 찾을 수 없습니다.');
    }

    return listing;
  }

  // 메모 대화 스레드 권한/식별자 판정
  private resolveMessageThread(
    listing: TradeListing,
    member: Member,
    thread?: string,
  ): string {
    const isOwner = listing.ownerAccountId === member.accountId;
    const requests = this.getPendingRequests(listing);
    const participantIds = new Set(
      requests.map((entry) => entry.requesterAccountId),
    );

    // 완료된 거래의 선택된 상대와도 대화를 이어갈 수 있다.
    if (listing.requesterAccountId != null) {
      participantIds.add(listing.requesterAccountId);
    }

    if (isOwner) {
      const target =
        thread ?? (participantIds.size === 1 ? [...participantIds][0] : null);

      if (!target || !participantIds.has(target)) {
        throw new BadRequestException('대화할 거래 요청자를 선택하세요.');
      }

      return target;
    }

    if (!participantIds.has(member.accountId)) {
      throw new ForbiddenException('이 거래의 대화에 참여할 수 없습니다.');
    }

    return member.accountId;
  }

  private isSiteActive(
    accountId: string,
    lastActiveByAccountId?: Map<string, Date>,
  ): boolean {
    const lastActiveAt = lastActiveByAccountId?.get(accountId);

    return (
      lastActiveAt != null &&
      Date.now() - lastActiveAt.getTime() <= OWNER_ACTIVE_WINDOW_MS
    );
  }

  // 정렬용 게시자 활동 순위: 바람비전 활동중(0) > 메월 접속중(1) > 그 외(2)
  private resolvePresenceRank(
    listing: TradeListing,
    lastActiveByAccountId: Map<string, Date>,
    mverseOnlineByTag: Map<string, boolean | null>,
  ): number {
    if (this.isSiteActive(listing.ownerAccountId, lastActiveByAccountId)) {
      return 0;
    }

    if (
      listing.ownerMaplestoryWorldId &&
      mverseOnlineByTag.get(listing.ownerMaplestoryWorldId) === true
    ) {
      return 1;
    }

    return 2;
  }

  // 게시자 활동 상태. 일괄 조회한 lastActiveAt 맵이 있을 때만 판정한다.
  private resolveOwnerPresence(
    listing: TradeListing,
    lastActiveByAccountId?: Map<string, Date>,
  ): TradeOwnerPresence | undefined {
    if (!lastActiveByAccountId) {
      return undefined;
    }

    const lastActiveAt = lastActiveByAccountId.get(listing.ownerAccountId);

    return lastActiveAt != null &&
      Date.now() - lastActiveAt.getTime() <= OWNER_ACTIVE_WINDOW_MS
      ? 'active'
      : 'away';
  }

  // 페이지에 노출되는 아이템들의 조건별(아이템·염색·형상변환) 평균 시세 일괄 집계
  private async loadMarketStats(
    listings: TradeListing[],
  ): Promise<Map<string, MarketStats>> {
    const itemIds = [...new Set(listings.map((listing) => listing.itemId))];

    if (itemIds.length === 0) {
      return new Map();
    }

    const completed = await this.tradeListingModel
      .find({ itemId: { $in: itemIds }, status: 'completed' })
      .sort({ closedAt: -1 })
      .limit(LISTING_SCAN_LIMIT)
      .select({ itemId: 1, dyeItemId: 1, transformItemId: 1, price: 1 })
      .lean()
      .exec();

    const pricesByKey = new Map<string, number[]>();

    for (const entry of completed) {
      const price = parseNumericPrice(entry.price);

      if (price == null) {
        continue;
      }

      const key = getMarketStatsKey(entry);
      const prices = pricesByKey.get(key) ?? [];

      if (prices.length >= PRICE_STATS_SAMPLE_LIMIT) {
        continue;
      }

      prices.push(price);
      pricesByKey.set(key, prices);
    }

    const statsByKey = new Map<string, MarketStats>();

    for (const [key, prices] of pricesByKey) {
      statsByKey.set(key, {
        averagePrice: Math.round(
          prices.reduce((sum, price) => sum + price, 0) / prices.length,
        ),
        sampleCount: prices.length,
      });
    }

    return statsByKey;
  }

  private serializeListing(
    listing: TradeListing,
    context: SerializeContext,
  ): SerializedTradeListing {
    const {
      member,
      lastActiveByAccountId,
      mverseOnlineByTag,
      marketStatsByKey,
    } = context;
    const accountId = member?.accountId;
    const requests = this.getPendingRequests(listing);
    const isMine = accountId != null && listing.ownerAccountId === accountId;
    const hasPendingRequest =
      accountId != null &&
      requests.some((entry) => entry.requesterAccountId === accountId);
    const isCompletedRequester =
      accountId != null && listing.requesterAccountId === accountId;
    const isRequester = hasPendingRequest || isCompletedRequester;

    // 게시자 연락처: 게시자 본인, 진행 중 요청을 보낸 사람, 완료된 거래 상대에게 공개
    const canSeeOwnerContact =
      isMine ||
      hasPendingRequest ||
      (listing.status === 'completed' && isCompletedRequester);
    // 선택된 요청자 연락처: 게시자와 본인에게 공개
    const canSeeRequesterContact =
      (isMine || isCompletedRequester) && listing.requesterAccountId != null;

    const marketStats = marketStatsByKey?.get(getMarketStatsKey(listing));

    return {
      id: String(listing._id),
      type: listing.type,
      status: listing.status,
      itemId: listing.itemId,
      itemName: listing.itemName,
      itemType: listing.itemType,
      durability: listing.durability,
      dyeItemId: listing.dyeItemId,
      dyeName: listing.dyeName,
      transformItemId: listing.transformItemId,
      transformItemName: listing.transformItemName,
      price: listing.price,
      quantity: listing.quantity,
      memo: listing.memo,
      ownerNickname: listing.ownerNickname,
      ownerAccountId:
        isMine || isRequester ? listing.ownerAccountId : undefined,
      ownerMaplestoryWorldId: listing.ownerMaplestoryWorldId,
      // 바람의나라 닉네임은 거래 당사자(요청 이후)에게만 공개한다.
      ownerBaramNickname:
        isMine || isRequester ? listing.ownerBaramNickname : undefined,
      ownerPresence: this.resolveOwnerPresence(listing, lastActiveByAccountId),
      ownerMverseOnline: listing.ownerMaplestoryWorldId
        ? mverseOnlineByTag?.get(listing.ownerMaplestoryWorldId)
        : undefined,
      requestCount: requests.length,
      requests: isMine
        ? requests.map((entry) => ({
            requesterAccountId: entry.requesterAccountId,
            nickname: entry.requesterNickname,
            discordId: entry.requesterDiscordId,
            email: entry.requesterEmail,
            maplestoryWorldId: entry.requesterMaplestoryWorldId,
            baramNickname: entry.requesterBaramNickname,
            requestedAt: entry.requestedAt.toISOString(),
          }))
        : undefined,
      threads: context.threadsByListingId?.get(String(listing._id)),
      requesterNickname: listing.requesterNickname,
      requesterMaplestoryWorldId: listing.requesterMaplestoryWorldId,
      ownerDiscordId: canSeeOwnerContact ? listing.ownerDiscordId : undefined,
      ownerEmail: canSeeOwnerContact ? listing.ownerEmail : undefined,
      requesterDiscordId: canSeeRequesterContact
        ? listing.requesterDiscordId
        : undefined,
      requesterEmail: canSeeRequesterContact
        ? listing.requesterEmail
        : undefined,
      marketAveragePrice: marketStats?.averagePrice ?? null,
      marketSampleCount: marketStats?.sampleCount ?? 0,
      createdAt: listing.createdAt.toISOString(),
      requestedAt: listing.requestedAt?.toISOString(),
      closedAt: listing.closedAt?.toISOString(),
      isMine,
      isRequester,
    };
  }
}
