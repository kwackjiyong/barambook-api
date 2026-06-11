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
import { QueryTradeListingsDto } from './dto/query-trade-listings.dto';
import { TradeResolveStatusDto } from './dto/update-trade-status.dto';
import {
  DYEABLE_ITEM_TYPES,
  EQUIP_ITEM_TYPES,
  TradeCancellation,
  TradeItemType,
  TradeListing,
  TradeMessage,
  TradeRequestEntry,
  TradeStatus,
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
  ownerMaplestoryWorldId?: string;
  ownerBaramNickname?: string;
  ownerPresence?: TradeOwnerPresence;
  ownerMverseOnline?: boolean | null;
  requestCount: number;
  // 게시자에게만 내려가는 요청자 목록 (연락처 포함)
  requests?: SerializedTradeRequest[];
  requesterNickname?: string;
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
}

const DEFAULT_PAGE_SIZE = 20;
const OWNER_LISTING_LIMIT = 10;
const PRICE_STATS_SAMPLE_LIMIT = 20;
const PRICE_SUMMARY_DEFAULT_LIMIT = 8;
const PRICE_SUMMARY_SCAN_LIMIT = 400;
const MY_TRADES_LIMIT = 50;
// 활동중 우선 정렬을 위해 한 번에 스캔하는 최대 게시글 수
const LISTING_SCAN_LIMIT = 400;
// 진행 중(open/requested) 게시글 등록 한도
const ACTIVE_LISTING_LIMIT = 5;
// 한 회원이 동시에 보낼 수 있는 거래 요청 한도
const ACTIVE_REQUEST_LIMIT = 5;
// 게시글 하나에 쌓일 수 있는 요청 한도
const LISTING_REQUEST_LIMIT = 20;
// 주간 취소 패널티: 7일 안에 3건 취소 시 7일간 거래 불가
const CANCEL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CANCEL_LIMIT_PER_WINDOW = 3;
const TRADE_MESSAGE_LIMIT = 100;
// 마지막 사이트 활동이 이 시간 이내면 게시자를 '활동중'으로 본다
const OWNER_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const STATUS_SORT_ORDER: TradeStatus[] = [
  'requested',
  'open',
  'completed',
  'canceled',
];
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
  } | null = null;

  constructor(
    @InjectModel('trade_listings', 'barambook')
    private readonly tradeListingModel: Model<TradeListing>,
    @InjectModel('trade_cancellations', 'barambook')
    private readonly tradeCancellationModel: Model<TradeCancellation>,
    @InjectModel('trade_messages', 'barambook')
    private readonly tradeMessageModel: Model<TradeMessage>,
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

    const [result] = await this.tradeListingModel
      .aggregate<{
        items: TradeListing[];
        total: { count: number }[];
        statusCounts: { _id: TradeStatus; count: number }[];
      }>([
        { $match: filter },
        {
          $addFields: {
            statusOrder: { $indexOfArray: [STATUS_SORT_ORDER, '$status'] },
          },
        },
        // 가격 필터가 있을 때만 숫자(콤마 허용) 가격을 파싱해 거른다
        ...(hasPriceFilter
          ? [
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
              { $match: { numericPrice: priceConditions } },
            ]
          : []),
        { $sort: { statusOrder: 1, createdAt: -1 } },
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

    // 바람비전 접속여부 > 메월 접속여부 > 등록순 (상태 그룹 안에서)
    const ranked = result.items
      .map((listing, index) => ({
        listing,
        index,
        statusOrder: STATUS_SORT_ORDER.indexOf(listing.status),
        presenceRank: this.resolvePresenceRank(
          listing,
          lastActiveByAccountId,
          mverseOnlineByTag,
        ),
      }))
      .sort((a, b) => {
        if (a.statusOrder !== b.statusOrder) {
          return a.statusOrder - b.statusOrder;
        }

        if (a.presenceRank !== b.presenceRank) {
          return a.presenceRank - b.presenceRank;
        }

        return a.index - b.index;
      });

    const pageItems = ranked
      .slice((page - 1) * pageSize, page * pageSize)
      .map((entry) => entry.listing);

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
    const context: SerializeContext = {
      member,
      lastActiveByAccountId,
      marketStatsByKey,
    };

    return {
      listing: this.serializeListing(listing, context),
      owner: {
        nickname: listing.ownerNickname,
        joinedAt: owner?.createdAt?.toISOString(),
        maplestoryWorldId: listing.ownerMaplestoryWorldId,
        baramNickname: listing.ownerBaramNickname,
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

  async createListing(
    member: Member,
    dto: CreateTradeListingDto,
  ): Promise<SerializedTradeListing> {
    this.assertHasContact(member);
    await this.memberService.assertVerifiedMverseProfile(member);
    this.assertHasBaramNickname(member);
    await this.assertNotTradeBanned(member.accountId);

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

    let dye: TradeDyeOption | undefined;

    if (isDyeable && dto.dyeItemId != null) {
      const options = await this.getDyeOptions();
      const pool = itemType === 'w' ? options.weaponDyes : options.armorDyes;
      dye = pool.find((entry) => entry.itemId === dto.dyeItemId);

      if (!dye) {
        throw new BadRequestException(
          '선택한 염색약을 이 아이템에 적용할 수 없습니다.',
        );
      }
    }

    let transformItem: CatalogItem | undefined;

    if (isDyeable && dto.transformItemId != null) {
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
      // 닉네임은 인증된 메월 닉네임으로 노출한다.
      ownerNickname: this.resolveDisplayNickname(member),
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
  ): Promise<SerializedTradeListing> {
    await this.memberService.assertVerifiedMverseProfile(member);
    this.assertHasBaramNickname(member);
    await this.assertNotTradeBanned(member.accountId);

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
      requesterNickname: this.resolveDisplayNickname(member),
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

    // 게시자에게 SSE/웹푸시 알림 (실패해도 거래 흐름을 막지 않는다)
    void this.notificationService
      .notifyTradeRequest(listing.ownerAccountId, {
        listingId: String(listing._id),
        itemName: listing.itemName,
        price: listing.price,
        requesterNickname: entry.requesterNickname,
        url: `/trade/${String(listing._id)}`,
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
      listing.requesterNickname = selected.requesterNickname;
      listing.requesterDiscordId = selected.requesterDiscordId;
      listing.requesterEmail = selected.requesterEmail;
      listing.requestedAt = selected.requestedAt;
    } else {
      // 게시 취소는 주간 취소 패널티 대상이다.
      await this.recordCancellation(member.accountId, listing, 'owner');
    }

    listing.status = status as TradeStatus;
    listing.closedAt = new Date();

    await listing.save();

    return this.serializeListing(listing, { member });
  }

  /**
   * 거래 요청 철회/거절.
   * - 요청자 본인: 자신의 요청을 취소한다 (주간 취소 패널티 대상).
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
      listing.requesterDiscordId = undefined;
      listing.requesterEmail = undefined;
    }

    if (listing.requests.length === 0) {
      listing.status = 'open';
      listing.requestedAt = undefined;
    }

    await listing.save();

    // 요청자 본인의 취소만 주간 취소 패널티 대상이다 (게시자의 거절은 제외).
    if (!isOwner) {
      await this.recordCancellation(member.accountId, listing, 'requester');
    }

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

    const context: SerializeContext = { member };

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
  async findMessages(
    id: string,
    member: Member,
    thread?: string,
  ): Promise<{ thread: string; messages: SerializedTradeMessage[] }> {
    const listing = await this.findListingById(id);
    const threadAccountId = this.resolveMessageThread(listing, member, thread);

    const messages = await this.tradeMessageModel
      .find({ listingId: listing._id, threadAccountId })
      .sort({ createdAt: 1 })
      .limit(TRADE_MESSAGE_LIMIT)
      .exec();

    return {
      thread: threadAccountId,
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
    const threadAccountId = this.resolveMessageThread(listing, member, thread);
    const trimmed = content.trim();

    if (!trimmed) {
      throw new BadRequestException('메모 내용을 입력하세요.');
    }

    const message = new this.tradeMessageModel({
      listingId: listing._id,
      threadAccountId,
      authorAccountId: member.accountId,
      authorNickname: this.resolveDisplayNickname(member),
      content: trimmed,
      createdAt: new Date(),
    });

    await message.save();

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

  private buildListingFilter(
    query: QueryTradeListingsDto,
  ): FilterQuery<TradeListing> {
    const filter: FilterQuery<TradeListing> = {};

    if (query.type) {
      filter.type = query.type;
    }

    if (query.itemType === 'etc') {
      // 장비 외 전부. 타입 도입 이전(미저장) 게시글도 기타로 취급한다.
      filter.itemType = { $nin: EQUIP_ITEM_TYPES };
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
    const matched =
      catalog.equip.find((entry) => entry.name === itemName) ??
      catalog.etc.find((entry) => entry.name === itemName) ??
      catalog.equip.find((entry) => entry.id === itemId) ??
      catalog.etc.find((entry) => entry.id === itemId);

    return (matched?.type as TradeItemType | undefined) ?? fallback;
  }

  private async loadItemCatalog(): Promise<{
    equip: CatalogItem[];
    etc: CatalogItem[];
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
          requesterMaplestoryWorldId: undefined,
          requesterBaramNickname: undefined,
          requestedAt: listing.requestedAt ?? listing.createdAt,
        },
      ];
    }

    return [];
  }

  // 닉네임 노출은 인증된 메월 닉네임을 우선한다.
  private resolveDisplayNickname(member: Member): string {
    return (
      member.maplestoryWorldProfileName ?? member.nickname ?? member.accountId
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

  // 주간 취소 패널티: 최근 7일 취소가 3건 이상이면 3번째 취소로부터 7일간 거래 불가
  private async assertNotTradeBanned(accountId: string): Promise<void> {
    const windowStart = new Date(Date.now() - CANCEL_WINDOW_MS);
    const cancellations = await this.tradeCancellationModel
      .find({ accountId, canceledAt: { $gte: windowStart } })
      .sort({ canceledAt: -1 })
      .limit(CANCEL_LIMIT_PER_WINDOW)
      .select({ canceledAt: 1 })
      .lean()
      .exec();

    if (cancellations.length < CANCEL_LIMIT_PER_WINDOW) {
      return;
    }

    const thirdLatest = cancellations[CANCEL_LIMIT_PER_WINDOW - 1];
    const bannedUntil = new Date(
      thirdLatest.canceledAt.getTime() + CANCEL_WINDOW_MS,
    );

    if (bannedUntil.getTime() > Date.now()) {
      const formatted = new Intl.DateTimeFormat('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(bannedUntil);

      throw new BadRequestException(
        `일주일 동안 거래 취소가 ${CANCEL_LIMIT_PER_WINDOW}건 이상 발생해 거래가 제한되었습니다. ${formatted} 이후에 다시 이용할 수 있습니다.`,
      );
    }
  }

  private async recordCancellation(
    accountId: string,
    listing: TradeListing,
    role: 'owner' | 'requester',
  ): Promise<void> {
    await this.tradeCancellationModel.create({
      accountId,
      listingId: listing._id,
      role,
      canceledAt: new Date(),
    });
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
      ownerMaplestoryWorldId: listing.ownerMaplestoryWorldId,
      ownerBaramNickname: listing.ownerBaramNickname,
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
      requesterNickname: listing.requesterNickname,
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
