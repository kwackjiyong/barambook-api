import { Controller, Get, Query, Req, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { SearchHopaeDto } from './dto/search-hopae.dto';
import { HopaeService } from './hopae.service';

@Controller('hopae')
export class HopaeController {
  constructor(private readonly hopaeService: HopaeService) {}

  @Get('search')
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
}
