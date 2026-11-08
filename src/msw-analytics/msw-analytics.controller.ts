import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { IngestMswEventsDto } from './dto/ingest-msw-events.dto';
import { MswAnalyticsService, PlayerSort } from './msw-analytics.service';
import { NoStoreInterceptor } from './no-store.interceptor';

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
  return clampNumber(raw, fallback, 500);
}

function clampNumber(
  raw: string | undefined,
  fallback: number,
  max: number,
  min = 1,
) {
  const value = Number(raw);
  if (raw === undefined || raw === '' || !Number.isInteger(value))
    return fallback;
  if (value < min) return fallback;
  return Math.min(value, max);
}

function parseDate(raw: string | undefined) {
  if (!raw) return undefined;
  const date = /^\d+$/.test(raw) ? new Date(Number(raw)) : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('bad date');
  return date;
}

function parseCursor(raw: string | undefined) {
  if (!raw) return undefined;
  const match = /^(\d+)_([0-9a-f]{24})$/.exec(raw);
  if (!match) throw new BadRequestException('bad cursor');
  return { at: new Date(Number(match[1])), id: match[2] };
}

const PLAYER_SORTS: PlayerSort[] = ['recent', 'level', 'playtime', 'new'];

@Controller('msw-analytics')
@UseInterceptors(NoStoreInterceptor)
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

  /** 누적·활성 이용자, 오늘 집계, 레벨·직업 분포, 최고 레벨 상위 20명. */
  @Get('summary')
  summary(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Query('key') queryKey: string | undefined,
  ) {
    this.authorize(key, queryKey);
    return this.service.summary();
  }

  /** 최근 days일(기본 30, 최대 400)의 일별 접속자·신규·접속 횟수·플레이 시간·행동 건수. */
  @Get('daily')
  daily(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Query('key') queryKey: string | undefined,
    @Query('days') days: string | undefined,
  ) {
    this.authorize(key, queryKey);
    return this.service.daily(clampNumber(days, 30, 400));
  }

  /** 이용자 목록. q는 캐릭터명 앞부분 일치, 쪽 넘김은 skip. */
  @Get('players')
  players(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Query('key') queryKey: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('q') q: string | undefined,
    @Query('classCode') classCode: string | undefined,
    @Query('skip') skip: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    this.authorize(key, queryKey);
    const code = Number(classCode);
    return this.service.players({
      sort: PLAYER_SORTS.includes(sort as PlayerSort)
        ? (sort as PlayerSort)
        : 'recent',
      q: q?.trim().slice(0, 30) || undefined,
      classCode:
        classCode !== undefined && classCode !== '' && Number.isInteger(code)
          ? code
          : undefined,
      skip: Math.min(clampNumber(skip, 0, 1_000_000, 0), 1_000_000),
      limit: clampLimit(limit, 50),
    });
  }

  /** 최신순 행동 기록. 다음 쪽은 응답의 next를 before로 넘긴다. from·to는 ISO 날짜나 Unix ms. */
  @Get('events')
  events(
    @Headers('x-msw-analytics-key') key: string | undefined,
    @Query('key') queryKey: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('name') name: string | undefined,
    @Query('type') type: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('before') before: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    this.authorize(key, queryKey);
    return this.service.events({
      userId: userId || undefined,
      name: name || undefined,
      type: type || undefined,
      from: parseDate(from),
      to: parseDate(to),
      before: parseCursor(before),
      limit: clampLimit(limit, 100),
    });
  }

  /** 이벤트 원본에서 일별 집계를 다시 만든다. */
  @Post('rebuild-daily')
  rebuildDaily(@Headers('x-msw-analytics-key') key: string | undefined) {
    this.authorize(key);
    return this.service.rebuildDaily();
  }
}
