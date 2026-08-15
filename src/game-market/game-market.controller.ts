import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import {
  QueryGameMarketOverviewDto,
  QueryGameMarketQuotesDto,
} from './dto/query-game-market.dto';
import { GameMarketService } from './game-market.service';

@Controller('game-market')
export class GameMarketController {
  constructor(private readonly gameMarketService: GameMarketService) {}

  @Get('overview')
  getOverview(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryGameMarketOverviewDto,
  ) {
    return this.gameMarketService.getOverview(query);
  }

  @Get('quotes')
  getQuotes(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryGameMarketQuotesDto,
  ) {
    return this.gameMarketService.getQuotes(query);
  }
}
