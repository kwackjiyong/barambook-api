import {
  GameMarketChatInput,
  GameMarketService,
  ParsedQuoteEntry,
} from './game-market.service';

const catalog = [
  { id: 2, name: '괴력선창', type: 'w' },
  { id: 5, name: '수정의귀걸이', type: 'r' },
  { id: 6, name: '마법의반지', type: 'r' },
];

type BulkOp = { updateOne: { filter: { fingerprint: string } } };

/**
 * bulkWrite에 실제로 넘어간 연산과, 그때 돌려줄 upsertedIds를 조작할 수 있는 서비스.
 * upsertedIndexes에 넣은 인덱스만 신규 upsert로 처리된 것처럼 응답한다.
 */
function makeService(upsertedIndexes: number[] = []) {
  const recorded: { operations: BulkOp[] } = { operations: [] };

  const quoteModel = {
    bulkWrite: jest.fn((operations: BulkOp[]) => {
      recorded.operations = operations;
      const upsertedIds: Record<number, string> = {};
      for (const index of upsertedIndexes) {
        upsertedIds[index] = `id-${index}`;
      }
      return Promise.resolve({ upsertedIds });
    }),
  };

  const ingestionModel = {
    find: () => ({
      select: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }),
    }),
    insertMany: jest.fn(() => Promise.resolve([])),
  };

  const itemModel = {
    findOne: () => ({
      lean: () => ({ exec: () => Promise.resolve({ equip: catalog }) }),
    }),
  };

  const marketAlertService = {
    processNewQuotes: jest.fn<Promise<void>, [ParsedQuoteEntry[]]>(() =>
      Promise.resolve(),
    ),
  };

  const service = new GameMarketService(
    quoteModel as any,
    ingestionModel as any,
    itemModel as any,
    marketAlertService as any,
  );

  return { service, recorded, quoteModel, marketAlertService };
}

function makeChat(
  content: string,
  overrides: Partial<GameMarketChatInput> = {},
): GameMarketChatInput {
  return {
    type: '사자후',
    name: '산타별',
    worldTagId: 'DVaAB',
    content,
    sourceMessageId: `msg-${content}-${overrides.name ?? ''}`,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    ...overrides,
  };
}

describe('GameMarketService.ingestChats', () => {
  it('upsertedIds의 인덱스를 원본 순서 그대로 되짚는다', async () => {
    // 세 메시지가 각각 한 건씩 파싱되므로 operations 인덱스는 0,1,2가 된다.
    const { service, recorded } = makeService([0, 2]);

    const result = await service.ingestChats([
      makeChat('괴력 300팜', { sourceMessageId: 'a' }),
      makeChat('수정의귀걸이 500팜', { sourceMessageId: 'b' }),
      makeChat('마법의반지 20 팜', { sourceMessageId: 'c' }),
    ]);

    expect(recorded.operations).toHaveLength(3);
    expect(result.parsed).toBe(3);
    // 1번(수정의귀걸이)은 upsert되지 않았으므로 신규에서 빠져야 한다.
    expect(result.inserted).toHaveLength(2);
    expect(result.inserted.map((entry) => entry.quote.itemName)).toEqual([
      '괴력선창',
      '마법의반지',
    ]);
    // 되짚은 항목의 지문이 실제로 그 인덱스의 연산과 같아야 정합이 보장된다.
    expect(result.inserted[0].fingerprint).toBe(
      recorded.operations[0].updateOne.filter.fingerprint,
    );
    expect(result.inserted[1].fingerprint).toBe(
      recorded.operations[2].updateOne.filter.fingerprint,
    );
  });

  it('한 메시지에서 여러 호가가 나와도 인덱스가 밀리지 않는다', async () => {
    // 첫 메시지가 두 건으로 파싱되면 두 번째 메시지의 호가는 인덱스 2가 된다.
    const { service, recorded } = makeService([2]);

    const result = await service.ingestChats([
      makeChat('진분홍 괴력 300, 마법의반지 20 팜', { sourceMessageId: 'a' }),
      makeChat('수정의귀걸이 500팜', { sourceMessageId: 'b' }),
    ]);

    expect(recorded.operations).toHaveLength(3);
    expect(result.inserted).toHaveLength(1);
    expect(result.inserted[0].quote.itemName).toBe('수정의귀걸이');
    expect(result.inserted[0].chat.sourceMessageId).toBe('b');
  });

  it('반복 사자후로 upsert가 없으면 신규가 비어 있다', async () => {
    const { service } = makeService([]);

    const result = await service.ingestChats([makeChat('괴력 300팜')]);

    expect(result.parsed).toBe(1);
    expect(result.inserted).toEqual([]);
  });

  it('사자후가 없으면 bulkWrite를 호출하지 않는다', async () => {
    const { service, quoteModel } = makeService([0]);

    const result = await service.ingestChats([
      makeChat('괴력 300팜', { type: '방송쿠폰' }),
    ]);

    expect(quoteModel.bulkWrite).not.toHaveBeenCalled();
    expect(result.inserted).toEqual([]);
  });
});

describe('GameMarketService.ingestChats 알림 연결', () => {
  it('신규뿐 아니라 재광고분도 알림 처리로 넘긴다', async () => {
    // upsert된 건 1건뿐이지만, 조건별 중복 판정은 알림 쪽이 하므로 전부 넘긴다.
    const { service, marketAlertService } = makeService([1]);

    await service.ingestChats([
      makeChat('괴력 300팜', { sourceMessageId: 'a' }),
      makeChat('수정의귀걸이 500팜', { sourceMessageId: 'b' }),
    ]);

    expect(marketAlertService.processNewQuotes).toHaveBeenCalledTimes(1);
    const passed = marketAlertService.processNewQuotes.mock.calls[0][0];
    expect(passed).toHaveLength(2);
    expect(passed.map((entry) => entry.quote.itemName)).toEqual([
      '괴력선창',
      '수정의귀걸이',
    ]);
    // 지문이 함께 넘어가야 조건별 중복 판정이 가능하다.
    expect(passed[0].fingerprint).toEqual(expect.any(String));
  });

  it('신규 upsert가 없어도 파싱된 호가가 있으면 알림 처리를 부른다', async () => {
    const { service, marketAlertService } = makeService([]);

    await service.ingestChats([makeChat('괴력 300팜')]);

    expect(marketAlertService.processNewQuotes).toHaveBeenCalledTimes(1);
  });

  it('파싱된 호가가 없으면 알림 처리를 부르지 않는다', async () => {
    const { service, marketAlertService } = makeService([]);

    await service.ingestChats([makeChat('오늘 날씨 좋네요')]);

    expect(marketAlertService.processNewQuotes).not.toHaveBeenCalled();
  });

  it('notify:false면 신규가 있어도 알리지 않는다', async () => {
    const { service, marketAlertService } = makeService([0]);

    await service.ingestChats([makeChat('괴력 300팜')], { notify: false });

    expect(marketAlertService.processNewQuotes).not.toHaveBeenCalled();
  });

  it('알림 처리가 실패해도 적재 결과를 되돌리지 않는다', async () => {
    const { service, marketAlertService } = makeService([0]);
    marketAlertService.processNewQuotes.mockRejectedValueOnce(
      new Error('boom'),
    );

    const result = await service.ingestChats([makeChat('괴력 300팜')]);

    expect(result.inserted).toHaveLength(1);
  });
});
