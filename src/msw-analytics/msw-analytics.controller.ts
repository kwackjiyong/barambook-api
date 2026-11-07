import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { IngestMswEventsDto } from './dto/ingest-msw-events.dto';
import { MswAnalyticsService } from './msw-analytics.service';

// 바람클래식 MSW 게임 서버(BaramAnalytics550)와 공유하는 키는 환경변수 MSW_ANALYTICS_KEY로만 받는다.
// 게임 쪽 값은 서버 전용 데이터셋 BaramAnalyticsConfig550의 apiKey 행이다. 둘이 같아야 한다.
// 환경변수가 없으면 모든 요청을 거절한다.
function secretsMatch(
  actual: string | undefined,
  expected: string | undefined,
) {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function clampLimit(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, 500);
}

@Controller('msw-analytics')
export class MswAnalyticsController {
  constructor(private readonly service: MswAnalyticsService) {}

  private authorize(headerKey: string | undefined, queryKey?: string) {
    if (!secretsMatch(headerKey ?? queryKey, process.env.MSW_ANALYTICS_KEY)) {
      throw new UnauthorizedException('invalid analytics key');
    }
  }

  /** 게임 서버가 이벤트를 묶어서 보낸다 (최대 200건). */
  @Post('events')
  ingest(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: IngestMswEventsDto,
  ) {
    this.authorize(key);
    return this.service.ingest(body);
  }

  /** 접속자·레벨 분포·직업 분포·일별 접속 요약. 브라우저에서는 ?key= 로 볼 수 있다. */
  @Get('summary')
  summary(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Query('key') queryKey: string | undefined,
  ) {
    this.authorize(key, queryKey);
    return this.service.summary();
  }

  @Get('players')
  players(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Query('key') queryKey: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    this.authorize(key, queryKey);
    return this.service.players(
      sort === 'level' ? 'level' : 'recent',
      clampLimit(limit, 100),
    );
  }

  @Get('events')
  events(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Query('key') queryKey: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('name') name: string | undefined,
    @Query('type') type: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    this.authorize(key, queryKey);
    return this.service.events({ userId, name, type }, clampLimit(limit, 100));
  }
}
