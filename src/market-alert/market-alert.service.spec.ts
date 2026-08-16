import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ParsedMarketQuote } from '../game-market/game-market.parser';
import { MarketAlertPush } from '../notification/notification.service';
import { CreateMarketAlertRuleDto } from './dto/market-alert-rule.dto';
import { MarketAlertService, MarketQuoteEvent } from './market-alert.service';
import { MarketAlertRule, MAX_RULES_PER_ACCOUNT } from './market-alert.schema';

type Recorded = {
  findOneFilter?: Record<string, any>;
  findFilter?: Record<string, any>;
  updateFilters?: Record<string, any>[];
  noticeUpserts?: Record<string, any>[];
  cooldownLookups?: Array<{ sellerKey: string }>;
  created?: Record<string, any>;
  deletedId?: unknown;
};

function makeQuote(
  overrides: Partial<ParsedMarketQuote> = {},
): ParsedMarketQuote {
  return {
    side: 'sell',
    itemId: 2,
    itemName: '괴력선창',
    itemType: 'w',
    quantity: 1,
    bundlePriceDivided: false,
    currency: 'gold',
    priceAmount: 3_000_000,
    originalPriceText: '300',
    confidence: 0.98,
    matchedAlias: '괴력',
    excludedFromGeneral: false,
    ...overrides,
  };
}

function makeEvent(
  quoteOverrides: Partial<ParsedMarketQuote> = {},
  ageMs = 0,
  fingerprint = 'fp-default',
  sellerName = '산타별',
): MarketQuoteEvent {
  return {
    observedAt: new Date(Date.now() - ageMs),
    chat: { name: sellerName, worldTagId: 'DVaAB' },
    quote: makeQuote(quoteOverrides),
    fingerprint,
  };
}

function makeRule(overrides: Partial<MarketAlertRule> = {}) {
  return {
    _id: new Types.ObjectId(),
    accountId: 'acc-1',
    itemId: 2,
    itemName: '괴력선창',
    side: 'sell',
    currency: 'gold',
    priceLimit: 3_000_000,
    enabled: true,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    save: jest.fn(() => Promise.resolve(undefined)),
    ...overrides,
  } as unknown as MarketAlertRule & { save: jest.Mock };
}

function makeService(
  options: {
    existing?: MarketAlertRule | null;
    count?: number;
    byId?: MarketAlertRule | null;
    matchRules?: MarketAlertRule[];
    /** 이미 알린 것으로 취급할 (ruleId, fingerprint) 쌍 */
    notified?: Array<{ ruleId: string; fingerprint: string }>;
    /** 쿨다운에 걸린 것으로 취급할 sellerKey 목록 */
    cooledDownSellers?: string[];
  } = {},
) {
  const recorded: Recorded = {};

  const model = {
    find: (filter?: Record<string, any>) => {
      recorded.findFilter = filter;
      return {
        sort: () => ({ exec: () => Promise.resolve([]) }),
        exec: () => Promise.resolve(options.matchRules ?? []),
      };
    },
    // 이제 조건 문서의 갱신은 표시용 lastNotifiedAt 기록뿐이다.
    updateOne: (filter: Record<string, any>) => {
      recorded.updateFilters = [...(recorded.updateFilters ?? []), filter];
      return { exec: () => Promise.resolve({ modifiedCount: 1 }) };
    },
    findOne: (filter: Record<string, any>) => {
      recorded.findOneFilter = filter;
      return { exec: () => Promise.resolve(options.existing ?? null) };
    },
    findById: () => ({
      exec: () => Promise.resolve(options.byId ?? null),
    }),
    countDocuments: () => ({
      exec: () => Promise.resolve(options.count ?? 0),
    }),
    create: (doc: Record<string, any>) => {
      recorded.created = doc;
      return Promise.resolve(makeRule(doc as Partial<MarketAlertRule>));
    },
    deleteOne: (filter: { _id: unknown }) => {
      recorded.deletedId = filter._id;
      return { exec: () => Promise.resolve({ deletedCount: 1 }) };
    },
  };

  const noticeModel = {
    find: () => ({
      select: () => ({
        lean: () => ({ exec: () => Promise.resolve(options.notified ?? []) }),
      }),
    }),
    // 쿨다운 조회. cooledDownSellers에 든 판매자는 최근에 알린 것으로 취급한다.
    findOne: (filter: Record<string, any>) => {
      recorded.cooldownLookups = [
        ...(recorded.cooldownLookups ?? []),
        filter as { sellerKey: string },
      ];
      const blocked = (options.cooledDownSellers ?? []).includes(
        filter.sellerKey as string,
      );
      return {
        select: () => ({
          lean: () => ({
            exec: () => Promise.resolve(blocked ? { _id: 'x' } : null),
          }),
        }),
      };
    },
    create: (doc: Record<string, any>) => {
      recorded.noticeUpserts = [...(recorded.noticeUpserts ?? []), doc];
      return Promise.resolve(doc);
    },
  };

  const notificationService = {
    notifyMarketAlert: jest.fn<Promise<void>, [string, MarketAlertPush]>(() =>
      Promise.resolve(),
    ),
  };

  const service = new MarketAlertService(
    model as any,
    noticeModel as any,
    notificationService as any,
  );
  return { service, recorded, notificationService };
}

const baseDto: CreateMarketAlertRuleDto = {
  itemId: 2,
  itemName: '괴력선창',
  side: 'sell',
  currency: 'gold',
  priceLimit: 3_000_000,
};

describe('MarketAlertService.createRule', () => {
  it('염색·형상변환을 비우면 일반품만 찾도록 null로 대조한다', async () => {
    const { service, recorded } = makeService();

    await service.createRule('acc-1', baseDto);

    // undefined로 두면 조건이 통째로 사라져 엉뚱한 조건과 합쳐진다.
    expect(recorded.findOneFilter).toEqual({
      accountId: 'acc-1',
      itemId: 2,
      side: 'sell',
      currency: 'gold',
      dyeName: null,
      transformItemId: null,
    });
  });

  it('가격만 다른 같은 조건은 새로 만들지 않고 갱신한다', async () => {
    const existing = makeRule({ priceLimit: 5_000_000, enabled: false });
    const { service, recorded } = makeService({ existing });

    const result = await service.createRule('acc-1', {
      ...baseDto,
      priceLimit: 2_000_000,
    });

    expect(result.created).toBe(false);
    expect(existing.priceLimit).toBe(2_000_000);
    // 껐던 조건을 다시 등록하면 켜진다.
    expect(existing.enabled).toBe(true);
    expect(recorded.created).toBeUndefined();
  });

  it('염색이 다르면 별개 조건으로 새로 만든다', async () => {
    const { service, recorded } = makeService();

    const result = await service.createRule('acc-1', {
      ...baseDto,
      dyeName: '은묵',
    });

    expect(result.created).toBe(true);
    expect(recorded.created?.dyeName).toBe('은묵');
    expect(recorded.findOneFilter?.dyeName).toBe('은묵');
  });

  it('상한을 넘으면 등록을 막는다', async () => {
    const { service } = makeService({ count: MAX_RULES_PER_ACCOUNT });

    await expect(service.createRule('acc-1', baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('상한 직전이면 등록된다', async () => {
    const { service } = makeService({ count: MAX_RULES_PER_ACCOUNT - 1 });

    const result = await service.createRule('acc-1', baseDto);

    expect(result.created).toBe(true);
  });
});

describe('MarketAlertService 소유권', () => {
  it('남의 조건은 수정할 수 없다', async () => {
    const rule = makeRule({ accountId: 'acc-2' });
    const { service } = makeService({ byId: rule });

    await expect(
      service.updateRule('acc-1', String(rule._id), { enabled: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('남의 조건은 삭제할 수 없다', async () => {
    const rule = makeRule({ accountId: 'acc-2' });
    const { service, recorded } = makeService({ byId: rule });

    await expect(
      service.deleteRule('acc-1', String(rule._id)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recorded.deletedId).toBeUndefined();
  });

  it('본인 조건은 수정된다', async () => {
    const rule = makeRule();
    const { service } = makeService({ byId: rule });

    const result = await service.updateRule('acc-1', String(rule._id), {
      enabled: false,
      priceLimit: 1_000,
    });

    expect(result.item.enabled).toBe(false);
    expect(result.item.priceLimit).toBe(1_000);
  });

  it('없는 조건은 404로 알린다', async () => {
    const { service } = makeService({ byId: null });

    await expect(
      service.deleteRule('acc-1', String(new Types.ObjectId())),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ObjectId 형식이 아니면 조회 전에 막는다', async () => {
    const { service } = makeService();

    await expect(
      service.deleteRule('acc-1', 'not-an-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MarketAlertService.processNewQuotes', () => {
  it('sell 조건은 가격 이하일 때만 알린다', async () => {
    const rule = makeRule({ side: 'sell', priceLimit: 3_000_000 });
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([makeEvent({ priceAmount: 3_500_000 })]);
    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();

    await service.processNewQuotes([makeEvent({ priceAmount: 2_500_000 })]);
    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(1);
  });

  it('buy 조건은 가격 이상일 때만 알린다', async () => {
    const rule = makeRule({ side: 'buy', priceLimit: 3_000_000 });
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([
      makeEvent({ side: 'buy', priceAmount: 2_500_000 }),
    ]);
    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();

    await service.processNewQuotes([
      makeEvent({ side: 'buy', priceAmount: 3_500_000 }),
    ]);
    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(1);
  });

  it('조건에 염색이 없으면 염색된 매물은 걸러진다', async () => {
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000, dyeName: '은묵' }),
    ]);

    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();
  });

  it('조건에 염색이 있으면 같은 염색만 통과한다', async () => {
    const rule = makeRule({ dyeName: '은묵' });
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([makeEvent({ priceAmount: 1_000_000 })]);
    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000, dyeName: '진분홍색' }),
    ]);
    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000, dyeName: '은묵' }),
    ]);
    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(1);
  });

  it('조건에 형상변환이 없으면 형변 매물은 걸러진다', async () => {
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000, transformItemId: 3 }),
    ]);

    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();
  });

  it('오래된 매물은 알리지 않는다', async () => {
    const rule = makeRule();
    const { service, notificationService, recorded } = makeService({
      matchRules: [rule],
    });

    // 백필로 과거 채팅이 신규 upsert된 상황.
    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 60 * 60 * 1000),
    ]);

    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();
    // 조건 조회조차 가지 않아야 한다.
    expect(recorded.findFilter).toBeUndefined();
  });

  it('같은 판매자가 쿨다운 중이면 보내지 않는다', async () => {
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
      cooledDownSellers: ['dvaab|산타별'],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 0, 'fp-1', '산타별'),
    ]);

    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();
  });

  it('다른 판매자의 같은 호가는 쿨다운과 무관하게 보낸다', async () => {
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
      cooledDownSellers: ['dvaab|산타별'],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 0, 'fp-2', '홍길동'),
    ]);

    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(1);
    expect(
      notificationService.notifyMarketAlert.mock.calls[0][1].sellerName,
    ).toBe('홍길동');
  });

  it('한 배치에 판매자가 여럿이면 각각 보낸다', async () => {
    const rule = makeRule({ side: 'sell', priceLimit: 3_000_000 });
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 2_000_000 }, 0, 'fp-a', '산타별'),
      makeEvent({ priceAmount: 1_500_000 }, 0, 'fp-b', '홍길동'),
    ]);

    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(2);
  });

  it('같은 판매자가 여러 매물을 걸면 가장 유리한 1건만 보낸다', async () => {
    const rule = makeRule({ side: 'sell', priceLimit: 3_000_000 });
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 2_800_000 }, 0, 'fp-a', '산타별'),
      makeEvent({ priceAmount: 1_200_000 }, 0, 'fp-b', '산타별'),
    ]);

    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(1);
    expect(
      notificationService.notifyMarketAlert.mock.calls[0][1].priceText,
    ).toBe('120만');
  });

  it('쿨다운 조회에 판매자 키가 들어간다', async () => {
    const rule = makeRule();
    const { service, recorded } = makeService({ matchRules: [rule] });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 0, 'fp-1', '산타별'),
    ]);

    expect(recorded.cooldownLookups?.[0].sellerKey).toBe('dvaab|산타별');
  });

  it('조건을 걸기 전부터 있던 매물도 재광고되면 한 번은 알린다', async () => {
    // 지문이 이미 존재해 신규 upsert가 아닌 재광고분. 예전 판정이라면 조용했다.
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 0, 'fp-old-listing'),
    ]);

    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(1);
  });

  it('이미 알린 매물은 다시 알리지 않는다', async () => {
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
      notified: [{ ruleId: String(rule._id), fingerprint: 'fp-seen' }],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 0, 'fp-seen'),
    ]);

    expect(notificationService.notifyMarketAlert).not.toHaveBeenCalled();
  });

  it('다른 조건이 알린 매물은 내 조건에는 영향이 없다', async () => {
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
      notified: [{ ruleId: 'other-rule', fingerprint: 'fp-seen' }],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 0, 'fp-seen'),
    ]);

    expect(notificationService.notifyMarketAlert).toHaveBeenCalledTimes(1);
  });

  it('발송한 매물만 기록을 남긴다', async () => {
    const rule = makeRule({ side: 'sell', priceLimit: 3_000_000 });
    const { service, recorded } = makeService({ matchRules: [rule] });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 2_800_000 }, 0, 'fp-expensive', '산타별'),
      makeEvent({ priceAmount: 1_200_000 }, 0, 'fp-cheap', '산타별'),
    ]);

    // 밀린 매물에 기록을 남기면 다음 기회에 후보가 되지 못한다.
    expect(recorded.noticeUpserts).toHaveLength(1);
    expect(recorded.noticeUpserts?.[0].fingerprint).toBe('fp-cheap');
    expect(recorded.noticeUpserts?.[0].sellerKey).toBe('dvaab|산타별');
  });

  it('쿨다운에 막히면 기록을 남기지 않아 다음에 다시 후보가 된다', async () => {
    const rule = makeRule();
    const { service, recorded } = makeService({
      matchRules: [rule],
      cooledDownSellers: ['dvaab|산타별'],
    });

    await service.processNewQuotes([
      makeEvent({ priceAmount: 1_000_000 }, 0, 'fp-blocked'),
    ]);

    expect(recorded.noticeUpserts).toBeUndefined();
  });

  it('묶음과 내구도를 알림 본문에 함께 적는다', async () => {
    const rule = makeRule();
    const { service, notificationService } = makeService({
      matchRules: [rule],
    });

    await service.processNewQuotes([
      makeEvent({
        priceAmount: 1_000_000,
        quantity: 10,
        bundlePriceDivided: true,
        durability: 70,
      }),
    ]);

    const payload = notificationService.notifyMarketAlert.mock.calls[0][1];
    expect(payload.detail).toBe('묶음 10개 / 내구 70');
    expect(payload.sellerName).toBe('산타별');
    expect(payload.sideLabel).toBe('판매');
  });
});
