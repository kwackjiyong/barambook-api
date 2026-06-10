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

export interface TradeDyeOptions {
  weaponDyes: TradeDyeOption[];
  armorDyes: TradeDyeOption[];
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
            items: [
              { $skip: (page - 1) * pageSize },
              { $limit: pageSize },
            ],
            total: [{ $count: 'count' }],
            statusCounts: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
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

    return {
      items: result.items.map((listing) =>
        this.serializeListing(listing, member),
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      openCount: countByStatus.get('open') ?? 0,
      requestedCount: countByStatus.get('requested') ?? 0,
      activeTrade: activeTrade
        ? this.serializeListing(activeTrade, member)
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
      .find({ ownerAccountId: listing.ownerAccountId, _id: { $ne: listing._id } })
      .sort({ createdAt: -1 })
      .limit(OWNER_LISTING_LIMIT)
      .exec();

    return {
      listing: this.serializeListing(listing, member),
      owner: {
        nickname: listing.ownerNickname,
        joinedAt: owner?.createdAt?.toISOString(),
        maplestoryWorldId: listing.ownerMaplestoryWorldId,
      },
      ownerListings: ownerListings.map((entry) =>
        this.serializeListing(entry, member),
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
    const isOwner = listing.ownerAccountId === member.accountId;
    const isRequester = listing.requesterAccountId === member.accountId;

    if (listing.status === 'open') {
      if (status !== TradeResolveStatusDto.Canceled || !isOwner) {
        throw new ForbiddenException('이 거래를 변경할 수 없습니다.');
      }
    } else if (listing.status === 'requested') {
      if (!isOwner && !isRequester) {
        throw new ForbiddenException('이 거래를 변경할 수 없습니다.');
      }
    } else {
      throw new BadRequestException('이미 종료된 거래입니다.');
    }

    listing.status = status as TradeStatus;
    listing.closedAt = new Date();

    await listing.save();

    return this.serializeListing(listing, member);
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
        '진행 중인 거래를 먼저 완료하거나 취소하세요.',
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

  private serializeListing(
    listing: TradeListing,
    member?: Member | null,
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
      requesterNickname: listing.requesterNickname,
      ownerDiscordId: canSeeOwnerDiscordId
        ? listing.ownerDiscordId
        : undefined,
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
