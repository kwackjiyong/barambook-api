import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { OperatorGuard } from '../member/operator.guard';
import { SearchHopaeDto } from './dto/search-hopae.dto';
import { HopaeDenialService } from './hopae-denial.service';
import { HopaeTokenGuard } from './hopae-token.guard';
import { HopaeService } from './hopae.service';

@Controller('hopae')
export class HopaeController {
  constructor(
    private readonly hopaeService: HopaeService,
    private readonly denialService: HopaeDenialService,
  ) {}

  /** 페이지가 발급한 이름 묶음 토큰이 있어야 검색된다(hopae-token.ts 참고). */
  @Get('search')
  @UseGuards(HopaeTokenGuard)
  search(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: SearchHopaeDto,
    @Req() request: Request,
  ) {
    return this.hopaeService.searchByName(
      query.name,
      request.ip || request.socket.remoteAddress || 'unknown',
    );
  }

  @Get('ranking')
  async ranking() {
    return { items: await this.hopaeService.getDailyRanking() };
  }

  /** 토큰 없이 검색을 두드린 요청을 IP 별로 묶어 본다. 운영자 전용. */
  @Get('denied')
  @UseGuards(OperatorGuard)
  async denied(@Query('days') days?: string, @Query('limit') limit?: string) {
    return {
      items: await this.denialService.summarizeByIp(
        Number(days),
        Number(limit),
      ),
    };
  }

  /** IP 하나의 최근 거부 요청 목록. 운영자 전용. */
  @Get('denied/events')
  @UseGuards(OperatorGuard)
  async deniedEvents(@Query('ip') ip?: string, @Query('limit') limit?: string) {
    const target = typeof ip === 'string' ? ip.trim() : '';
    if (!target) return { ip: '', items: [] };
    return {
      ip: target,
      items: await this.denialService.listEvents(target, Number(limit)),
    };
  }
}
