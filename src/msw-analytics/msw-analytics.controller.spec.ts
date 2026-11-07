import {
  ArgumentMetadata,
  BadRequestException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { IngestMswEventsDto } from './dto/ingest-msw-events.dto';
import { MswAnalyticsController } from './msw-analytics.controller';
import { MswAnalyticsService } from './msw-analytics.service';

const KEY = 'test-analytics-key';
process.env.MSW_ANALYTICS_KEY = KEY;

describe('MswAnalyticsController', () => {
  const service = {
    ingest: jest.fn(),
    summary: jest.fn(),
    players: jest.fn(),
    events: jest.fn(),
  };
  const controller = new MswAnalyticsController(
    service as unknown as MswAnalyticsService,
  );
  const body = {
    instance: 'i1',
    events: [
      {
        type: 'login' as const,
        userId: 'u1',
        name: '톡톡GM',
        level: 99,
        classCode: 4,
        map: '부여성',
        at: 1_790_000_000,
      },
    ],
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects a wrong key', () => {
    expect(() => controller.ingest('wrong', body)).toThrow(
      UnauthorizedException,
    );
    expect(() => controller.summary(undefined, 'wrong')).toThrow(
      UnauthorizedException,
    );
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it('accepts the game server batch and the browser ?key= summary', () => {
    void controller.ingest(KEY, body);
    expect(service.ingest).toHaveBeenCalledWith(body);
    void controller.summary(undefined, KEY);
    expect(service.summary).toHaveBeenCalled();
  });

  it('validates event payloads', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const meta: ArgumentMetadata = {
      type: 'body',
      metatype: IngestMswEventsDto,
    };
    await expect(pipe.transform(body, meta)).resolves.toBeInstanceOf(
      IngestMswEventsDto,
    );
    await expect(
      pipe.transform({ events: [{ ...body.events[0], type: 'hack' }] }, meta),
    ).rejects.toThrow(BadRequestException);
    await expect(pipe.transform({ events: [] }, meta)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      pipe.transform(
        { events: [{ ...body.events[0], data: { item: '도토리', count: 3 } }] },
        meta,
      ),
    ).resolves.toBeInstanceOf(IngestMswEventsDto);
  });
});

describe('MswAnalyticsService.ingest', () => {
  it('stores events and upserts the player summary', async () => {
    const eventModel = { insertMany: jest.fn().mockResolvedValue([]) };
    const playerModel = { bulkWrite: jest.fn().mockResolvedValue({}) };
    const service = new MswAnalyticsService(
      eventModel as never,
      playerModel as never,
    );
    const result = await service.ingest({
      events: [
        {
          type: 'login',
          userId: 'u1',
          name: '하나',
          level: 12,
          classCode: 1,
          map: '부여성',
          at: 1_790_000_000,
        },
        {
          type: 'logout',
          userId: 'u1',
          name: '하나',
          level: 13,
          classCode: 1,
          map: '부여성',
          at: 1_790_000_600,
          data: { playSeconds: 600 },
        },
      ],
    });
    expect(result).toEqual({ result: 'ok', accepted: 2 });
    type Op = {
      updateOne: { update: Record<string, Record<string, unknown>> };
    };
    const docs = (eventModel.insertMany.mock.calls as [{ at: Date }[]][])[0][0];
    expect(docs[0].at.toISOString()).toBe(
      new Date(1_790_000_000_000).toISOString(),
    );
    const ops = (playerModel.bulkWrite.mock.calls as [Op[]][])[0][0];
    expect(ops[0].updateOne.update.$inc).toEqual({ logins: 1 });
    expect(ops[1].updateOne.update.$inc).toEqual({ playSeconds: 600 });
    expect(ops[1].updateOne.update.$max).toEqual({
      lastSeenAt: docs[1].at,
      maxLevel: 13,
    });
  });
});
