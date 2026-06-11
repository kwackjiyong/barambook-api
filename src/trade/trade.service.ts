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
import { CreateTradeListingDto } from './dto/create-trade-listing.dto';
import { QueryTradeListingsDto } from './dto/query-trade-listings.dto';
import { TradeResolveStatusDto } from './dto/update-trade-status.dto';
import {
  DYEABLE_ITEM_TYPES,
  EQUIP_ITEM_TYPES,
  TradeItemType,
  TradeListing,
  TradeStatus,
} from './trade.schema';

// 게시자의 바람비전 활동 상태. 마지막 사이트 활동(하트비트)이
// OWNER_ACTIVE_WINDOW_MS 이내면 'active'(활동중), 아니면 'away'(부재중).
export type TradeOwnerPresence = 'active' | 'away';

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
  ownerPresence?: TradeOwnerPresence;
  requesterNickname?: string;
  ownerDiscordId?: string;
  requesterDiscordId?: string;
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
  };
  ownerListings: SerializedTradeListing[];
}

interface CatalogItem {
  id: number;
  name: string;
  type: string;
}

const DEFAULT_PAGE_SIZE = 20;
const OWNER_LISTING_LIMIT = 10;
const PRICE_STATS_SAMPLE_LIMIT = 20;
const PRICE_SUMMARY_DEFAULT_LIMIT = 8;
const PRICE_SUMMARY_SCAN_LIMIT = 400;
const MY_TRADES_LIMIT = 50;
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
    @InjectModel('items', 'barambook')
    private readonly itemModel: Model<Item>,
    private readonly memberService: MemberService,
  ) {}

  async findListings(
    query: QueryTradeListingsDto,
    member?: Member | null,
  ): Promise<TradeListingsPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const filter = this.buildListingFilter(query);

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
        { $sort: { statusOrder: 1, createdAt: -1 } },
        {
          $facet: {
            items: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
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

    const activeTrade = member
      ? await this.tradeListingModel
          .findOne({
            status: 'requested',
            $or: [
              { ownerAccountId: member.accountId },
              { requesterAccountId: member.accountId },
            ],
          })
          .exec()
      : null;

    const ownerAccountIds = new Set(
      result.items.map((listing) => listing.ownerAccountId),
    );

    if (activeTrade) {
      ownerAccountIds.add(activeTrade.ownerAccountId);
    }

    const lastActiveByAccountId =
      await this.memberService.findLastActiveByAccountIds([...ownerAccountIds]);

    return {
      items: result.items.map((listing) =>
        this.serializeListing(listing, member, lastActiveByAccountId),
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      openCount: countByStatus.get('open') ?? 0,
      requestedCount: countByStatus.get('requested') ?? 0,
      activeTrade: activeTrade
        ? this.serializeListing(activeTrade, member, lastActiveByAccountId)
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

    return {
      listing: this.serializeListing(listing, member, lastActiveByAccountId),
      owner: {
        nickname: listing.ownerNickname,
        joinedAt: owner?.createdAt?.toISOString(),
        maplestoryWorldId: listing.ownerMaplestoryWorldId,
      },
      ownerListings: ownerListings.map((entry) =>
        this.serializeListing(entry, member, lastActiveByAccountId),
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
      .map((listing) => listing.price.replace(/,/g, '').trim())
      .filter((price) => /^\d+$/.test(price))
      .map((price) => Number(price))
      .filter((price) => price > 0);

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
      const numeric = listing.price.replace(/,/g, '').trim();

      if (!/^\d+$/.test(numeric)) {
        continue;
      }

      const price = Number(numeric);

      if (price <= 0) {
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
    // 거래 연락 수단이 디스코드이므로 디스코드 SSO 계정만 등록을 허용한다.
    if (member.provider !== 'discord' || !member.discordId) {
      throw new ForbiddenException(
        '거래 게시글 등록은 디스코드 계정으로 로그인한 경우에만 가능합니다.',
      );
    }

    await this.assertNoActiveTrade(member.accountId);

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
      ownerNickname: member.nickname ?? member.accountId,
      ownerDiscordId: member.discordId,
      ownerMaplestoryWorldId: member.maplestoryWorldId,
    });

    await listing.save();

    return this.serializeListing(listing, member);
  }

  async requestTrade(
    id: string,
    member: Member,
  ): Promise<SerializedTradeListing> {
    await this.assertNoActiveTrade(member.accountId);

    const listing = await this.findListingById(id);

    if (listing.status !== 'open') {
      throw new BadRequestException('이미 진행 중이거나 종료된 거래입니다.');
    }

    if (listing.ownerAccountId === member.accountId) {
      throw new BadRequestException(
        '내가 등록한 게시글에는 거래 요청을 보낼 수 없습니다.',
      );
    }

    listing.status = 'requested';
    listing.requesterAccountId = member.accountId;
    listing.requesterNickname = member.nickname ?? member.accountId;
    listing.requesterDiscordId = member.discordId;
    listing.requestedAt = new Date();

    await listing.save();

    return this.serializeListing(listing, member);
  }

  async updateStatus(
    id: string,
    member: Member,
    status: TradeResolveStatusDto,
  ): Promise<SerializedTradeListing> {
    const listing = await this.findListingById(id);

    // 거래 완료/게시 취소 판정은 게시자만 할 수 있다.
    // (요청자는 releaseRequest로 자신의 요청만 취소할 수 있다)
    if (listing.ownerAccountId !== member.accountId) {
      throw new ForbiddenException('게시자만 거래 상태를 변경할 수 있습니다.');
    }

    if (listing.status === 'open') {
      if (status !== TradeResolveStatusDto.Canceled) {
        throw new BadRequestException(
          '거래 요청이 없는 게시글은 완료 처리할 수 없습니다.',
        );
      }
    } else if (listing.status !== 'requested') {
      throw new BadRequestException('이미 종료된 거래입니다.');
    }

    listing.status = status as TradeStatus;
    listing.closedAt = new Date();

    await listing.save();

    return this.serializeListing(listing, member);
  }

  // 게시자의 요청 거절 또는 요청자의 요청 취소.
  // 게시글을 닫지 않고 다시 거래 가능(open) 상태로 되돌린다.
  async releaseRequest(
    id: string,
    member: Member,
  ): Promise<SerializedTradeListing> {
    const listing = await this.findListingById(id);

    if (listing.status !== 'requested') {
      throw new BadRequestException('진행 중인 거래 요청이 없습니다.');
    }

    const isOwner = listing.ownerAccountId === member.accountId;
    const isRequester = listing.requesterAccountId === member.accountId;

    if (!isOwner && !isRequester) {
      throw new ForbiddenException('이 거래 요청을 변경할 수 없습니다.');
    }

    listing.status = 'open';
    listing.requesterAccountId = undefined;
    listing.requesterNickname = undefined;
    listing.requesterDiscordId = undefined;
    listing.requestedAt = undefined;

    await listing.save();

    return this.serializeListing(listing, member);
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
          { $match: { requesterAccountId: member.accountId } },
          ...sortStages,
        ])
        .exec(),
    ]);

    return {
      listings: listings.map((listing) =>
        this.serializeListing(listing, member),
      ),
      requests: requests.map((listing) =>
        this.serializeListing(listing, member),
      ),
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

  private async assertNoActiveTrade(accountId: string): Promise<void> {
    const active = await this.tradeListingModel
      .exists({
        status: 'requested',
        $or: [{ ownerAccountId: accountId }, { requesterAccountId: accountId }],
      })
      .exec();

    if (active) {
      throw new BadRequestException(
        '진행 중인 거래를 먼저 완료하거나 거절·취소하세요.',
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

  private serializeListing(
    listing: TradeListing,
    member?: Member | null,
    lastActiveByAccountId?: Map<string, Date>,
  ): SerializedTradeListing {
    const accountId = member?.accountId;
    const isMine = accountId != null && listing.ownerAccountId === accountId;
    const isRequester =
      accountId != null && listing.requesterAccountId === accountId;
    const canSeeOwnerDiscordId =
      isMine || (isRequester && listing.status === 'requested');
    const canSeeRequesterDiscordId =
      listing.status === 'requested' && (isMine || isRequester);

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
      ownerPresence: this.resolveOwnerPresence(listing, lastActiveByAccountId),
      requesterNickname: listing.requesterNickname,
      ownerDiscordId: canSeeOwnerDiscordId ? listing.ownerDiscordId : undefined,
      requesterDiscordId: canSeeRequesterDiscordId
        ? listing.requesterDiscordId
        : undefined,
      createdAt: listing.createdAt.toISOString(),
      requestedAt: listing.requestedAt?.toISOString(),
      closedAt: listing.closedAt?.toISOString(),
      isMine,
      isRequester,
    };
  }
}
