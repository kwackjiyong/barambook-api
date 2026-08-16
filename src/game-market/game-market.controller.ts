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

  /**
   * 파서가 실제로 만들어낼 수 있는 염색 이름 목록.
   *
   * 알림 조건의 dyeName은 파싱 결과와 정확히 일치해야 매칭된다. 거래소의
   * 염색약 아이템명('진분홍색 의상염색약')을 그대로 쓰면 영영 울리지 않는
   * 조건이 되므로, 조건 등록 UI는 반드시 이 목록에서 고르게 해야 한다.
   */
  @Get('dye-names')
  getDyeNames() {
    return this.gameMarketService.getDyeNames();
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
