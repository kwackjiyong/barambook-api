import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  MarketCurrency,
  ParsedMarketQuote,
} from '../game-market/game-market.parser';
import { NotificationService } from '../notification/notification.service';
import {
  CreateMarketAlertRuleDto,
  UpdateMarketAlertRuleDto,
} from './dto/market-alert-rule.dto';
import {
  MarketAlertNotice,
  MarketAlertRule,
  MAX_RULES_PER_ACCOUNT,
} from './market-alert.schema';

/**
 * 알림 판정에 필요한 최소 입력.
 * game-market의 ParsedQuoteEntry가 구조적으로 이 모양을 만족하므로
 * 두 모듈이 서로를 import하지 않아도 되고, 순환 참조가 생기지 않는다.
 */
export interface MarketQuoteEvent {
  observedAt: Date;
  chat: { name: string; worldTagId: string };
  quote: ParsedMarketQuote;
  // game_market_quotes와 같은 지문. 조건별 중복 판정의 키다.
  fingerprint: string;
}

// 이보다 오래된 매물은 알리지 않는다. 파서 룰을 고친 뒤 백필을 돌려
// 과거 매물이 한꺼번에 신규로 꽂혀도 이 선에서 걸러진다.
const ALERT_MAX_AGE_MS = 10 * 60 * 1000;
// 같은 조건 + 같은 판매자로 다시 알리기까지의 최소 간격.
// 판매자를 키에 넣었으므로, 값만 바꿔 도배하는 한 사람은 막히지만
// 다른 사람이 같은 호가를 올리면 곧바로 알림이 나간다.
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;

const SIDE_LABELS: Record<string, string> = { sell: '판매', buy: '구매' };

// 시세보기 화면(formatMoney)과 같은 표기를 쓴다.
function formatPrice(value: number, currency: MarketCurrency) {
  if (currency === 'cash') {
    if (value >= 10_000) {
      const amount = value / 10_000;
      return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}만원`;
    }
    return `${value.toLocaleString('ko-KR')}원`;
  }
  if (value >= 100_000_000) {
    const amount = value / 100_000_000;
    return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억`;
  }
  if (value >= 10_000) {
    const amount = value / 10_000;
    return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만`;
  }
  return `${value.toLocaleString('ko-KR')}전`;
}

@Injectable()
export class MarketAlertService {
  private readonly logger = new Logger(MarketAlertService.name);

  constructor(
    @InjectModel('market_alert_rules', 'barambook')
    private readonly ruleModel: Model<MarketAlertRule>,
    @InjectModel('market_alert_notices', 'barambook')
    private readonly noticeModel: Model<MarketAlertNotice>,
    private readonly notificationService: NotificationService,
  ) {}

  async listRules(accountId: string) {
    const rules = await this.ruleModel
      .find({ accountId })
      .sort({ createdAt: -1 })
      .exec();

    return {
      items: rules.map((rule) => this.serialize(rule)),
      limit: MAX_RULES_PER_ACCOUNT,
    };
  }

  /**
   * 조건 등록. 가격만 다른 같은 조건을 또 넣으면 새로 만들지 않고 가격을 바꾼다.
   * 같은 아이템에 조건이 여러 개 쌓이면 매물 하나에 알림이 중복으로 나가기 때문이다.
   */
  async createRule(accountId: string, dto: CreateMarketAlertRuleDto) {
    const identity = this.identityFilter(accountId, dto);
    const existing = await this.ruleModel.findOne(identity).exec();

    if (existing) {
      existing.priceLimit = dto.priceLimit;
      existing.itemName = dto.itemName;
      // 껐던 조건을 다시 등록하면 켜 주는 편이 기대에 가깝다.
      existing.enabled = true;
      await existing.save();

      return { created: false, item: this.serialize(existing) };
    }

    const count = await this.ruleModel.countDocuments({ accountId }).exec();

    if (count >= MAX_RULES_PER_ACCOUNT) {
      throw new BadRequestException(
        `알림 조건은 계정당 ${MAX_RULES_PER_ACCOUNT}개까지 등록할 수 있습니다.`,
      );
    }

    const created = await this.ruleModel.create({
      accountId,
      itemId: dto.itemId,
      itemName: dto.itemName,
      side: dto.side,
      currency: dto.currency,
      priceLimit: dto.priceLimit,
      dyeName: dto.dyeName,
      transformItemId: dto.transformItemId,
      transformItemName: dto.transformItemName,
      enabled: true,
    });

    return { created: true, item: this.serialize(created) };
  }

  async updateRule(
    accountId: string,
    ruleId: string,
    dto: UpdateMarketAlertRuleDto,
  ) {
    const rule = await this.findOwnedRule(accountId, ruleId);

    if (dto.priceLimit != null) rule.priceLimit = dto.priceLimit;
    if (dto.enabled != null) rule.enabled = dto.enabled;

    await rule.save();

    return { item: this.serialize(rule) };
  }

  async deleteRule(accountId: string, ruleId: string) {
    const rule = await this.findOwnedRule(accountId, ruleId);
    await this.ruleModel.deleteOne({ _id: rule._id }).exec();

    return { ok: true };
  }

  /**
   * 유입된 호가를 등록된 조건과 대조해 웹푸시를 보낸다.
   *
   * 신규 매물만 받는 게 아니라 재광고분도 함께 받는다. 조건별로 이미 알린
   * 지문을 기억해 두고 거르므로, 도배는 그대로 막히면서 조건을 걸기 전부터
   * 광고 중이던 매물도 다음 외침에 한 번은 알림이 간다.
   */
  async processNewQuotes(events: MarketQuoteEvent[]): Promise<void> {
    const now = Date.now();
    const fresh = events.filter(
      (event) => now - event.observedAt.getTime() <= ALERT_MAX_AGE_MS,
    );

    if (!fresh.length) return;

    const itemIds = [...new Set(fresh.map((event) => event.quote.itemId))];
    const rules = await this.ruleModel
      .find({ enabled: true, itemId: { $in: itemIds } })
      .exec();

    if (!rules.length) return;

    const candidates: Array<{
      rule: MarketAlertRule;
      event: MarketQuoteEvent;
    }> = [];

    for (const rule of rules) {
      for (const event of fresh) {
        if (this.matches(rule, event.quote)) candidates.push({ rule, event });
      }
    }

    if (!candidates.length) return;

    // 이미 알린 (조건, 지문) 쌍을 한 번에 조회해 걸러낸다.
    const notified = await this.findNotifiedKeys(candidates);
    const unseen = candidates.filter(
      ({ rule, event }) =>
        !notified.has(this.noticeKey(String(rule._id), event.fingerprint)),
    );

    // 한 판매자가 같은 조건에 여러 매물을 걸면 가장 유리한 1건만 보낸다.
    // 판매자가 다르면 각각 보낸다. 밀린 매물은 기록을 남기지 않으므로
    // 다음 유입에서 다시 후보가 된다.
    const bestBySeller = new Map<
      string,
      { rule: MarketAlertRule; event: MarketQuoteEvent }
    >();

    for (const entry of unseen) {
      const key = this.noticeKey(
        String(entry.rule._id),
        this.sellerKey(entry.event.chat),
      );
      const current = bestBySeller.get(key);

      if (
        !current ||
        this.isBetter(entry.rule, entry.event.quote, current.event.quote)
      ) {
        bestBySeller.set(key, entry);
      }
    }

    for (const { rule, event } of bestBySeller.values()) {
      await this.sendAlert(rule, event, now);
    }
  }

  private noticeKey(ruleId: string, suffix: string) {
    return `${ruleId}|${suffix}`;
  }

  /** 같은 캐릭명이 월드마다 있을 수 있으므로 월드 태그까지 묶어 식별한다. */
  private sellerKey(chat: { name: string; worldTagId: string }) {
    return `${chat.worldTagId.toLowerCase()}|${chat.name}`;
  }

  private async findNotifiedKeys(
    candidates: Array<{ rule: MarketAlertRule; event: MarketQuoteEvent }>,
  ): Promise<Set<string>> {
    const notices = await this.noticeModel
      .find({
        $or: candidates.map(({ rule, event }) => ({
          ruleId: String(rule._id),
          fingerprint: event.fingerprint,
        })),
      })
      .select({ ruleId: 1, fingerprint: 1 })
      .lean()
      .exec();

    return new Set(
      notices.map((notice) =>
        this.noticeKey(notice.ruleId, notice.fingerprint),
      ),
    );
  }

  private async sendAlert(
    rule: MarketAlertRule,
    event: MarketQuoteEvent,
    now: number,
  ): Promise<void> {
    const ruleId = String(rule._id);
    const sellerKey = this.sellerKey(event.chat);

    // 쿨다운은 조건+판매자 단위다. 같은 사람이 값만 바꿔 도배하면 막히고,
    // 다른 사람이 같은 호가를 올리면 별개 키라 곧바로 나간다.
    const recent = await this.noticeModel
      .findOne({
        ruleId,
        sellerKey,
        notifiedAt: { $gt: new Date(now - ALERT_COOLDOWN_MS) },
      })
      .select({ _id: 1 })
      .lean()
      .exec();

    if (recent) return;

    // 기록 삽입이 발송권 선점을 겸한다. (ruleId, fingerprint) unique 인덱스 덕에
    // 여러 인스턴스가 같은 매물을 동시에 집어도 한 쪽만 통과한다.
    try {
      await this.noticeModel.create({
        ruleId,
        fingerprint: event.fingerprint,
        sellerKey,
        notifiedAt: new Date(now),
      });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) return;
      throw error;
    }

    // 화면 표시용 최근 알림 시각. 발송 판정에는 쓰지 않는다.
    await this.ruleModel
      .updateOne({ _id: rule._id }, { $set: { lastNotifiedAt: new Date(now) } })
      .exec();

    try {
      await this.notificationService.notifyMarketAlert(rule.accountId, {
        ruleId: String(rule._id),
        itemName: event.quote.itemName,
        priceText: formatPrice(event.quote.priceAmount, event.quote.currency),
        sellerName: event.chat.name,
        sideLabel: SIDE_LABELS[event.quote.side] ?? event.quote.side,
        detail: this.buildDetail(event.quote),
        // 시세보기가 item 파라미터를 검색어로 받아 해당 아이템을 펼쳐 준다.
        url: `/market?item=${encodeURIComponent(event.quote.itemName)}`,
      });
    } catch (error) {
      // 발송 실패로 적재 흐름을 막지 않는다. 기록은 이미 남았으므로
      // 같은 매물이 곧바로 재시도되지도 않는다.
      this.logger.warn(
        `시세 알림 발송 실패 (rule=${ruleId}): ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  /**
   * 염색·형상변환은 지정한 값과 정확히 같을 때만 통과시킨다.
   * 조건에 값이 없으면 "아무거나"가 아니라 "그 옵션이 없는 매물"이라는 뜻이다.
   */
  private matches(rule: MarketAlertRule, quote: ParsedMarketQuote): boolean {
    if (quote.itemId !== rule.itemId) return false;
    if (quote.side !== rule.side) return false;
    if (quote.currency !== rule.currency) return false;
    if ((quote.dyeName ?? null) !== (rule.dyeName ?? null)) return false;
    if ((quote.transformItemId ?? null) !== (rule.transformItemId ?? null)) {
      return false;
    }

    // 파는 매물은 싼 것을, 사는 매물은 비싼 것을 찾는다.
    return rule.side === 'sell'
      ? quote.priceAmount <= rule.priceLimit
      : quote.priceAmount >= rule.priceLimit;
  }

  private isBetter(
    rule: MarketAlertRule,
    candidate: ParsedMarketQuote,
    current: ParsedMarketQuote,
  ): boolean {
    return rule.side === 'sell'
      ? candidate.priceAmount < current.priceAmount
      : candidate.priceAmount > current.priceAmount;
  }

  /** 묶음·내구도는 헛걸음의 주된 원인이라 알림 본문에 함께 적는다. */
  private buildDetail(quote: ParsedMarketQuote): string | undefined {
    const parts: string[] = [];

    if (quote.bundlePriceDivided || quote.quantity > 1) {
      parts.push(`묶음 ${quote.quantity}개`);
    }
    if (quote.durability != null) {
      parts.push(`내구 ${quote.durability}`);
    }

    return parts.length ? parts.join(' / ') : undefined;
  }

  private async findOwnedRule(accountId: string, ruleId: string) {
    if (!Types.ObjectId.isValid(ruleId)) {
      throw new BadRequestException('잘못된 조건 ID입니다.');
    }

    const rule = await this.ruleModel.findById(ruleId).exec();

    if (!rule) {
      throw new NotFoundException('알림 조건을 찾을 수 없습니다.');
    }

    // 남의 조건을 건드리지 못하게 소유자를 확인한다.
    if (rule.accountId !== accountId) {
      throw new ForbiddenException('본인의 알림 조건만 수정할 수 있습니다.');
    }

    return rule;
  }

  /**
   * 가격을 뺀 조건 동일성 필터.
   * 염색/형상변환은 값이 없으면 "일반품만"이라는 뜻이므로 null로 조회해
   * 필드가 없는 문서와 맞춘다. (undefined로 두면 조건 자체가 사라진다)
   */
  private identityFilter(
    accountId: string,
    dto: CreateMarketAlertRuleDto,
  ): FilterQuery<MarketAlertRule> {
    return {
      accountId,
      itemId: dto.itemId,
      side: dto.side,
      currency: dto.currency,
      dyeName: dto.dyeName ?? null,
      transformItemId: dto.transformItemId ?? null,
    };
  }

  private serialize(rule: MarketAlertRule) {
    return {
      id: String(rule._id),
      itemId: rule.itemId,
      itemName: rule.itemName,
      side: rule.side,
      currency: rule.currency,
      priceLimit: rule.priceLimit,
      dyeName: rule.dyeName ?? null,
      transformItemId: rule.transformItemId ?? null,
      transformItemName: rule.transformItemName ?? null,
      enabled: rule.enabled,
      lastNotifiedAt: rule.lastNotifiedAt?.toISOString() ?? null,
      createdAt: rule.createdAt?.toISOString() ?? null,
    };
  }
}
