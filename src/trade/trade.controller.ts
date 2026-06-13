import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { MemberSessionGuard } from '../member/member-session.guard';
import { Member } from '../member/member.schema';
import { MemberService } from '../member/member.service';
import { CreateTradeListingDto } from './dto/create-trade-listing.dto';
import { QueryMarketOverviewDto } from './dto/query-market-overview.dto';
import { QueryTradeItemMarketDto } from './dto/query-trade-item-market.dto';
import { QueryTradeListingsDto } from './dto/query-trade-listings.dto';
import { QueryTradePriceHistoryDto } from './dto/query-trade-price-history.dto';
import { QueryTradePriceSummaryDto } from './dto/query-trade-price-summary.dto';
import { QueryTradeStatsDto } from './dto/query-trade-stats.dto';
import { RequestTradeDto } from './dto/request-trade.dto';
import {
  CreateTradeMessageDto,
  QueryTradeMessagesDto,
} from './dto/trade-message.dto';
import { UpdateTradeStatusDto } from './dto/update-trade-status.dto';
import { TradeService } from './trade.service';

type TradeRequest = Request & {
  member?: Member;
};

const SESSION_COOKIE = 'barambook_session';

@Controller('trade')
export class TradeController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly memberService: MemberService,
  ) {}

  @Get()
  async findListings(
    @Req() req: TradeRequest,
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryTradeListingsDto,
  ) {
    const member = await this.findOptionalMember(req);
    return this.tradeService.findListings(query, member);
  }

  // 등록 폼/필터에서 선택할 염색약 목록 (무기염색약/의상염색약)
  @Get('dyes')
  getDyeOptions() {
    return this.tradeService.getDyeOptions();
  }

  // 등록 폼에 노출할 아이템 시세 (염색/형상변환 없는 완료 거래 기준)
  @Get('stats')
  getItemPriceStats(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryTradeStatsDto,
  ) {
    return this.tradeService.getItemPriceStats(query.itemId);
  }

  // 홈 화면에 노출할 아이템별 최근 시세 목록 (완료 거래 기준)
  @Get('stats/summary')
  getItemPriceSummaries(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryTradePriceSummaryDto,
  ) {
    return this.tradeService.getItemPriceSummaries(query.limit);
  }

  // 아이템 시세 패널: 현재 등록 매물(호가) vs 거래완료(체결가) 분리 노출
  @Get('item-market')
  getItemMarket(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryTradeItemMarketDto,
  ) {
    return this.tradeService.getItemMarket(query);
  }

  // 시세보기 탭(주식형): 인기 종목별 평균 호가/평균 체결가/변동률/스파크라인
  @Get('market-overview')
  getMarketOverview(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryMarketOverviewDto,
  ) {
    return this.tradeService.getMarketOverview(query.limit);
  }

  // 거래 상세 꺾은선 그래프: 같은 옵션 기준 체결가 추이
  @Get('price-history')
  getPriceHistory(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryTradePriceHistoryDto,
  ) {
    return this.tradeService.getPriceHistory(query);
  }

  // 내 거래 페이지: 내가 게시한 글 + 내가 보낸 요청
  @Get('my')
  @UseGuards(MemberSessionGuard)
  findMyTrades(@Req() req: TradeRequest) {
    return this.tradeService.findMyTrades(req.member as Member);
  }

  // 전역 안읽음 메모 합계 (헤더 배지용). ':id'보다 먼저 선언해야 한다.
  @Get('unread-summary')
  @UseGuards(MemberSessionGuard)
  getUnreadSummary(@Req() req: TradeRequest) {
    return this.tradeService.getUnreadSummary(req.member as Member);
  }

  @Get(':id')
  async findListingDetail(@Param('id') id: string, @Req() req: TradeRequest) {
    const member = await this.findOptionalMember(req);
    return this.tradeService.findListingDetail(id, member);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(MemberSessionGuard)
  createListing(
    @Req() req: TradeRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: CreateTradeListingDto,
  ) {
    return this.tradeService.createListing(req.member as Member, dto);
  }

  @Post(':id/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  requestTrade(
    @Param('id') id: string,
    @Req() req: TradeRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: RequestTradeDto,
  ) {
    return this.tradeService.requestTrade(
      id,
      req.member as Member,
      dto.message,
    );
  }

  // 요청자의 요청 취소 또는 게시자의 특정 요청 거절(?requester=accountId).
  // 남은 요청이 없으면 게시글은 open으로 복귀한다.
  @Delete(':id/request')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  releaseRequest(
    @Param('id') id: string,
    @Req() req: TradeRequest,
    @Query('requester') requester?: string,
  ) {
    return this.tradeService.releaseRequest(
      id,
      req.member as Member,
      requester?.trim() || undefined,
    );
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  updateStatus(
    @Param('id') id: string,
    @Req() req: TradeRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: UpdateTradeStatusDto,
  ) {
    return this.tradeService.updateStatus(
      id,
      req.member as Member,
      dto.status,
      dto.requesterAccountId,
    );
  }

  // 게시자-요청자 메모 대화 조회 (게시자는 ?thread=요청자accountId 지정)
  @Get(':id/messages')
  @UseGuards(MemberSessionGuard)
  findMessages(
    @Param('id') id: string,
    @Req() req: TradeRequest,
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryTradeMessagesDto,
  ) {
    return this.tradeService.findMessages(
      id,
      req.member as Member,
      query.thread,
    );
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(MemberSessionGuard)
  createMessage(
    @Param('id') id: string,
    @Req() req: TradeRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: CreateTradeMessageDto,
  ) {
    return this.tradeService.createMessage(
      id,
      req.member as Member,
      dto.content,
      dto.thread,
    );
  }

  private async findOptionalMember(req: Request): Promise<Member | null> {
    const sessionToken = this.readCookie(req, SESSION_COOKIE);

    if (!sessionToken) {
      return null;
    }

    try {
      return await this.memberService.findAuthenticatedMember(sessionToken);
    } catch {
      return null;
    }
  }

  private readCookie(req: Request, name: string): string | null {
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    const cookie = cookieHeader
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`));

    if (!cookie) {
      return null;
    }

    const [, rawValue = ''] = cookie.split('=');
    return decodeURIComponent(rawValue);
  }
}
