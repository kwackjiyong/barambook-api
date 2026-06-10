import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { MemberSessionGuard } from '../member/member-session.guard';
import { Member } from '../member/member.schema';
import { MemberService } from '../member/member.service';
import { CreateTradeListingDto } from './dto/create-trade-listing.dto';
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
  async findListings(@Req() req: TradeRequest) {
    const member = await this.findOptionalMember(req);
    return this.tradeService.findListings(member);
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
  requestTrade(@Param('id') id: string, @Req() req: TradeRequest) {
    return this.tradeService.requestTrade(id, req.member as Member);
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
