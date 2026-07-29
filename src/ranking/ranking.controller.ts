import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { SearchRankingDto } from './dto/search-ranking.dto';
import { UpsertRankingDto } from './dto/upsert-ranking.dto';
import { RANKING_VISIBLE_LIMIT, RankingService } from './ranking.service';

// 스캔 앱(barambook-scan)이 랭킹 배치를 올릴 때 쓰는 공유 시크릿. v2 업서트와 같은 값이다.
const UPSERT_SECRET =
  '5fa092bc12fb7c75200b7dd18526c7af9f664e49accdb8a51a377695f165f6736fc62402ff89a227fdff9fd4b0c07fb78a8a559356afda9f06b1c89005a2d4717e114d9bdb7daa1a837e9e29dbb6fb342819694bc90775512fb357471c59c388f87acde1d6823862ee678822bf89ed5619a11a7b421f4d0adf8b6b20f13f7534';

@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  /** 캐릭터 이름으로 점수 랭킹 조회. 직업과 무관하게 이름만으로 찾는다. */
  @Get('search')
  async search(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: SearchRankingDto,
  ) {
    const items = await this.rankingService.searchByName(query.name);

    return { limit: RANKING_VISIBLE_LIMIT, items };
  }

  /** 스캔 앱이 직업 하나의 랭킹(최대 1000행)을 올린다. */
  @Post('upsert')
  async upsert(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: UpsertRankingDto,
  ) {
    if (body.secret !== UPSERT_SECRET) {
      throw new UnauthorizedException({ result: 'fail', message: 'invalid secret' });
    }

    const result = await this.rankingService.upsertRankings(body);

    return { result: 'ok', ...result };
  }
}
