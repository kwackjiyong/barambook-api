import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Member } from '../member/member.schema';
import { CreateTradeListingDto } from './dto/create-trade-listing.dto';
import { TradeResolveStatusDto } from './dto/update-trade-status.dto';
import { TradeListing, TradeStatus } from './trade.schema';

export interface SerializedTradeListing {
  id: string;
  type: TradeListing['type'];
  status: TradeListing['status'];
  itemId: number;
  itemName: string;
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

@Injectable()
export class TradeService {
  constructor(
    @InjectModel('trade_listings', 'barambook')
    private readonly tradeListingModel: Model<TradeListing>,
  ) {}

  async findListings(member?: Member | null): Promise<SerializedTradeListing[]> {
    const listings = await this.tradeListingModel
      .find()
      .sort({ status: 1, createdAt: -1 })
      .limit(200)
      .exec();

    return listings.map((listing) => this.serializeListing(listing, member));
  }

  async createListing(
    member: Member,
    dto: CreateTradeListingDto,
  ): Promise<SerializedTradeListing> {
    await this.assertNoActiveTrade(member.accountId);

    const listing = new this.tradeListingModel({
      type: dto.type,
      status: 'open',
      itemId: dto.itemId,
      itemName: dto.itemName.trim(),
      price: dto.price.trim(),
      quantity: dto.quantity,
      memo: dto.memo?.trim(),
      ownerAccountId: member.accountId,
      ownerNickname: member.nickname ?? member.accountId,
      ownerDiscordId: dto.ownerDiscordId.trim(),
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
