import { BadRequestException, RequestTimeoutException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ChatFeedService } from './chat-feed.service';
import { ChatMessage } from './chat-feed.schema';

type Recorded = {
  filter?: Record<string, any>;
  sort?: Record<string, number>;
  limit?: number;
  maxTimeMS?: number;
};

function makeRow(createdAt: string) {
  return {
    _id: new Types.ObjectId(),
    type: '방송쿠폰',
    name: '산타별',
    worldTagId: 'DVaAB',
    content: '은묵수박지창 3200 사요',
    createdAt: new Date(createdAt),
  } as unknown as ChatMessage;
}

function makeService(rows: ChatMessage[] = [], failWith?: { code: number }) {
  const recorded: Recorded = {};
  const chain: any = {
    sort: (value: Record<string, number>) => ((recorded.sort = value), chain),
    limit: (value: number) => ((recorded.limit = value), chain),
    maxTimeMS: (value: number) => ((recorded.maxTimeMS = value), chain),
    exec: async () => {
      if (failWith) throw failWith;
      return rows;
    },
  };
  const model = {
    find: (filter: Record<string, any>) => ((recorded.filter = filter), chain),
  };
  const chatUserModel = {
    updateOne: () => ({ exec: async () => ({ acknowledged: true }) }),
  };
  const service = new ChatFeedService(model as any, chatUserModel as any);
  return { service, recorded };
}

function cursorOf(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString(
    'base64url',
  );
}

describe('ChatFeedService.findPage', () => {
  it('모든 조회에 시간 상한을 건다', async () => {
    const { service, recorded } = makeService([]);
    await service.findPage({});
    expect(recorded.maxTimeMS).toBe(5000);
    expect(recorded.sort).toEqual({ createdAt: -1, _id: -1 });
  });

  it('필터가 없으면 기간 조건을 덧붙이지 않는다', async () => {
    const { service, recorded } = makeService([]);
    const page = await service.findPage({});
    expect(recorded.filter?.createdAt).toBeUndefined();
    expect(page.searchWindow).toBeNull();
  });

  it('내용 검색에 기간이 없으면 최근 30일로 좁힌다', async () => {
    const { service, recorded } = makeService([]);
    const page = await service.findPage({ content: '수박' });
    const gte = recorded.filter?.createdAt?.$gte as Date;
    const elapsedDays = (Date.now() - gte.getTime()) / (24 * 60 * 60 * 1000);
    expect(elapsedDays).toBeCloseTo(30, 1);
    expect(page.searchWindow).toEqual({
      from: gte.toISOString(),
      days: 30,
    });
  });

  it('시작일을 직접 지정하면 그대로 쓰고 안내하지 않는다', async () => {
    const { service, recorded } = makeService([]);
    const from = '2026-01-01T00:00:00.000Z';
    const page = await service.findPage({ content: '수박', from });
    expect(recorded.filter?.createdAt?.$gte).toEqual(new Date(from));
    expect(page.searchWindow).toBeNull();
  });

  it('since는 더 새로운 채팅만 조회한다', async () => {
    const { service, recorded } = makeService([]);
    const at = '2026-08-08T06:00:00.000Z';
    const id = new Types.ObjectId().toHexString();
    await service.findPage({ since: cursorOf(at, id) });
    expect(recorded.filter?.$or).toEqual([
      { createdAt: { $gt: new Date(at) } },
      { createdAt: new Date(at), _id: { $gt: new Types.ObjectId(id) } },
    ]);
  });

  it('cursor는 더 오래된 채팅을 조회한다', async () => {
    const { service, recorded } = makeService([]);
    const at = '2026-08-08T06:00:00.000Z';
    const id = new Types.ObjectId().toHexString();
    await service.findPage({ cursor: cursorOf(at, id) });
    expect(recorded.filter?.$or?.[0]).toEqual({
      createdAt: { $lt: new Date(at) },
    });
  });

  it('cursor와 since를 함께 쓰면 거부한다', async () => {
    const { service } = makeService([]);
    const c = cursorOf(
      '2026-08-08T06:00:00.000Z',
      new Types.ObjectId().toHexString(),
    );
    await expect(service.findPage({ cursor: c, since: c })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('결과가 비어도 폴링 기준점을 돌려준다', async () => {
    const { service } = makeService([]);
    const page = await service.findPage({});
    expect(page.latestCursor).toBeTruthy();
  });

  it('과거 페이지 조회는 폴링 기준점을 건드리지 않는다', async () => {
    const { service } = makeService([makeRow('2026-08-08T06:00:00.000Z')]);
    const c = cursorOf(
      '2026-08-08T07:00:00.000Z',
      new Types.ObjectId().toHexString(),
    );
    const page = await service.findPage({ cursor: c });
    expect(page.latestCursor).toBeNull();
  });

  it('폴링 한도를 넘기면 gap으로 알린다', async () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      makeRow(new Date(Date.UTC(2026, 7, 8, 6, 0, 51 - i)).toISOString()),
    );
    const { service } = makeService(rows);
    const c = cursorOf(
      '2026-08-08T05:00:00.000Z',
      new Types.ObjectId().toHexString(),
    );
    const page = await service.findPage({ since: c });
    expect(page.items).toHaveLength(50);
    expect(page.gap).toBe(true);
    expect(page.nextCursor).toBe(page.items.at(-1)?.cursor);
  });

  it('시간 상한에 걸리면 408로 바꿔 돌려준다', async () => {
    const { service } = makeService([], { code: 50 });
    await expect(service.findPage({ content: '수박' })).rejects.toThrow(
      RequestTimeoutException,
    );
  });
});

describe('ChatFeedService.create', () => {
  it('stores a normalized v4 chat user when a message is collected', async () => {
    const created = makeRow('2026-08-14T00:00:00.000Z');
    const chatMessageModel = { create: jest.fn().mockResolvedValue(created) };
    const exec = jest.fn().mockResolvedValue({ acknowledged: true });
    const updateOne = jest.fn().mockReturnValue({ exec });
    const service = new ChatFeedService(
      chatMessageModel as any,
      { updateOne } as any,
    );

    await service.create(
      {
        type: created.type,
        name: ' main ',
        worldTagId: 'DVaAB',
        content: ' message ',
      },
      'message-1',
    );

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'main' },
      {
        $set: { name: 'main', worldTagId: 'dvaab' },
        $setOnInsert: { _id: 'main' },
      },
      { upsert: true },
    );
    expect(exec).toHaveBeenCalled();
  });
});
