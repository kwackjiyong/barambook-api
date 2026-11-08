import {
  ArgumentMetadata,
  BadRequestException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { IngestMswEventsDto } from './dto/ingest-msw-events.dto';
import { MswAnalyticsController } from './msw-analytics.controller';
import { Types } from 'mongoose';
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

  it('parses the events cursor and rejects a malformed one', () => {
    void controller.events(
      KEY,
      undefined,
      'u1',
      undefined,
      undefined,
      undefined,
      undefined,
      `1790000000000_${'a'.repeat(24)}`,
      undefined,
    );
    expect(service.events).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        before: { at: new Date(1_790_000_000_000), id: 'a'.repeat(24) },
        limit: 100,
      }),
    );
    const call = (bad: string) => () =>
      controller.events(
        KEY,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        bad,
        undefined,
      );
    expect(call('d123_x')).toThrow(BadRequestException);
    expect(call('1790000000000')).toThrow(BadRequestException);
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

function makeService(over: {
  playerUpserts?: Record<number, unknown>;
  pairUpserts?: Record<number, unknown>;
  dailyRows?: unknown[];
  eventRows?: unknown[];
}) {
  const chain = (rows: unknown[]) => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
  });
  const eventModel = {
    insertMany: jest.fn().mockResolvedValue([]),
    find: jest.fn(() => chain(over.eventRows ?? [])),
  };
  const playerModel = {
    bulkWrite: jest
      .fn()
      .mockResolvedValue({ upsertedIds: over.playerUpserts ?? {} }),
  };
  const dailyModel = {
    bulkWrite: jest.fn().mockResolvedValue({}),
    find: jest.fn(() => chain(over.dailyRows ?? [])),
  };
  const dailyUserModel = {
    bulkWrite: jest
      .fn()
      .mockResolvedValue({ upsertedIds: over.pairUpserts ?? {} }),
  };
  const service = new MswAnalyticsService(
    eventModel as never,
    playerModel as never,
    dailyModel as never,
    dailyUserModel as never,
  );
  return { service, eventModel, playerModel, dailyModel, dailyUserModel };
}

type Op = {
  updateOne: {
    filter: { _id: string };
    update: Record<string, Record<string, unknown>>;
  };
};

describe('MswAnalyticsService.ingest', () => {
  // 1_790_000_000 = 2026-09-21 23:33:20 KST, +600 s는 같은 날, +3600 s는 다음 날.
  const base = {
    userId: 'u1',
    name: '하나',
    level: 12,
    classCode: 1,
    map: '부여성',
  };

  it('stores events and upserts the player summary', async () => {
    const { service, eventModel, playerModel } = makeService({});
    const result = await service.ingest({
      events: [
        { ...base, type: 'login', at: 1_790_000_000 },
        {
          ...base,
          type: 'logout',
          level: 13,
          at: 1_790_000_600,
          data: { playSeconds: 600 },
        },
      ],
    });
    expect(result).toEqual({ result: 'ok', accepted: 2 });
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

  it('rolls events up per KST day, counting each user-day and new player once', async () => {
    const { service, dailyModel, dailyUserModel } = makeService({
      // 순서 없는 쓰기에서는 순번이 연산 순서와 어긋날 수 있다: _id 값으로만 센다.
      playerUpserts: { 3: 'u1' },
      pairUpserts: { 0: '2026-09-22|u1', 1: '2026-09-21|u1' },
    });
    await service.ingest({
      events: [
        { ...base, type: 'login', at: 1_790_000_000 },
        { ...base, type: 'item_pickup', at: 1_790_000_100 },
        {
          ...base,
          type: 'logout',
          at: 1_790_000_600,
          data: { playSeconds: 600 },
        },
        { ...base, type: 'login', at: 1_790_003_600 },
      ],
    });
    const pairs = (dailyUserModel.bulkWrite.mock.calls as [Op[]][])[0][0];
    expect(pairs.map((op) => op.updateOne.filter._id)).toEqual([
      '2026-09-21|u1',
      '2026-09-22|u1',
    ]);
    const days = (dailyModel.bulkWrite.mock.calls as [Op[]][])[0][0];
    const byDay = Object.fromEntries(
      days.map((op) => [op.updateOne.filter._id, op.updateOne.update.$inc]),
    );
    expect(byDay['2026-09-21']).toEqual({
      'events.login': 1,
      'events.item_pickup': 1,
      'events.logout': 1,
      logins: 1,
      playSeconds: 600,
      users: 1,
      newPlayers: 1,
    });
    expect(byDay['2026-09-22']).toEqual({
      'events.login': 1,
      logins: 1,
      users: 1,
    });
  });
});

describe('MswAnalyticsService queries', () => {
  it('fills missing days with zeros', async () => {
    const now = new Date('2026-11-08T03:00:00Z'); // 2026-11-08 12:00 KST
    const { service } = makeService({
      dailyRows: [{ _id: '2026-11-07', users: 5, playSeconds: 7200 }],
    });
    const rows = await service.daily(3, now);
    expect(rows.map((row) => [row.day, row.users, row.playHours])).toEqual([
      ['2026-11-06', 0, 0],
      ['2026-11-07', 5, 2],
      ['2026-11-08', 0, 0],
    ]);
  });

  it('pages events with an (at, _id) cursor', async () => {
    const at = new Date(1_790_000_000_000);
    const ids = ['a', 'b', 'c'].map((c) => new Types.ObjectId(c.repeat(24)));
    const { service, eventModel } = makeService({
      eventRows: ids.map((_id) => ({ _id, at })),
    });
    const page = await service.events({ limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.next).toBe(`${at.getTime()}_${'b'.repeat(24)}`);
    await service.events({
      limit: 2,
      before: { at, id: 'b'.repeat(24) },
    });
    const filter = (
      eventModel.find.mock.calls as unknown as [Record<string, unknown>][]
    )[1][0];
    expect(filter.$or).toEqual([
      { at: { $lt: at } },
      { at, _id: { $lt: ids[1] } },
    ]);
  });
});
