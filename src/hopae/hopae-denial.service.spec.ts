import type { Model } from 'mongoose';
import type { HopaeDeniedRequest } from './hopae-denial.schema';
import {
  HopaeDenialService,
  type HopaeDenialInput,
} from './hopae-denial.service';

function findChain<T>(value: T) {
  const chain = {
    sort: () => chain,
    limit: () => chain,
    select: () => chain,
    lean: () => chain,
    exec: () => Promise.resolve(value),
  };
  return chain;
}

describe('HopaeDenialService', () => {
  it('records without awaiting and swallows write failures', async () => {
    const create = jest.fn<Promise<never>, [HopaeDenialInput]>();
    create.mockRejectedValue(new Error('db down'));
    const service = new HopaeDenialService({
      create,
    } as unknown as Model<HopaeDeniedRequest>);

    expect(() =>
      service.record({
        ip: '  203.0.113.7 ',
        name: '홍길동',
        reason: 'missing',
        userAgent: 'x'.repeat(2000),
        referer: '',
      }),
    ).not.toThrow();

    // 실패는 로그로만 남고 밖으로 새지 않는다.
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledTimes(1);
    const [[doc]] = create.mock.calls;
    expect(doc.ip).toBe('203.0.113.7');
    expect(doc.userAgent).toHaveLength(512);
    expect(doc.referer).toBeUndefined();
  });

  it('summarizes by ip with reason counts and recent names', async () => {
    type Stage = { $match?: { createdAt: { $gte: Date } }; $limit?: number };
    const aggregate = jest.fn<{ exec: () => Promise<unknown[]> }, [Stage[]]>();
    aggregate.mockReturnValue({
      exec: () =>
        Promise.resolve([
          {
            _id: '203.0.113.7',
            count: 7,
            names: ['a', 'b', 'c', 'd', 'e', 'f'],
            firstSeen: new Date('2026-09-01T00:00:00Z'),
            lastSeen: new Date('2026-09-07T00:00:00Z'),
            reasons: ['missing', 'missing', 'mismatch', 'bogus'],
            lastUserAgent: 'curl/8.0',
            lastForwardedFor: '203.0.113.7, 10.0.0.1',
          },
        ]),
    });
    const service = new HopaeDenialService({
      aggregate,
    } as unknown as Model<HopaeDeniedRequest>);

    const rows = await service.summarizeByIp(400, 9999);

    // 기간·개수 상한이 잘린 채로 파이프라인에 들어간다.
    const [[pipeline]] = aggregate.mock.calls;
    const limitStage = pipeline.find((stage) => '$limit' in stage);
    expect(limitStage).toEqual({ $limit: 500 });
    const since = pipeline[0].$match?.createdAt.$gte as Date;
    expect(Date.now() - since.getTime()).toBeLessThanOrEqual(
      90 * 24 * 60 * 60 * 1000 + 1000,
    );

    expect(rows).toEqual([
      expect.objectContaining({
        ip: '203.0.113.7',
        count: 7,
        distinctNames: 6,
        reasons: { missing: 2, invalid: 0, expired: 0, mismatch: 1 },
        recentNames: ['b', 'c', 'd', 'e', 'f'],
        lastUserAgent: 'curl/8.0',
      }),
    ]);
  });

  it('lists events for one ip newest first', async () => {
    const events = [{ name: 'a', reason: 'missing', createdAt: new Date() }];
    const find = jest.fn().mockReturnValue(findChain(events));
    const service = new HopaeDenialService({
      find,
    } as unknown as Model<HopaeDeniedRequest>);

    await expect(service.listEvents(' 203.0.113.7 ', 0)).resolves.toBe(events);
    expect(find).toHaveBeenCalledWith({ ip: '203.0.113.7' });
  });
});
