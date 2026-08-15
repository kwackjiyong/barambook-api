import {
  BUY_MARKER,
  CASH_MARKET_ALIASES,
  CASH_PAYMENT_MARKER,
  GOLD_PAYMENT_MARKER,
  MARKET_DYE_ALIASES,
  MARKET_ITEM_ALIASES,
  PREFERRED_TRANSFORM_BASES,
  PREMIUM_DYE_NAMES,
  SELL_MARKER,
  TRANSFORM_CONTEXT_ALIASES,
  TRANSFORM_MARKER,
} from './game-market.rules';

export type MarketSide = 'sell' | 'buy';
export type MarketCurrency = 'gold' | 'cash';

export interface MarketCatalogItem {
  id: number;
  name: string;
  type: string;
}

export interface ParsedMarketQuote {
  side: MarketSide;
  itemId: number;
  itemName: string;
  itemType: string;
  dyeName?: string;
  transformItemId?: number;
  transformItemName?: string;
  durability?: number;
  quantity: number;
  bundlePriceDivided: boolean;
  bundleTotalPriceAmount?: number;
  currency: MarketCurrency;
  priceAmount: number;
  priceGold?: number;
  priceCashWon?: number;
  originalPriceText: string;
  confidence: number;
  matchedAlias: string;
  excludedFromGeneral: boolean;
  exclusionReason?: 'transform' | 'premium_dye';
}

interface MatchRule {
  alias: string;
  item: MarketCatalogItem;
  kind: 'exact' | 'alias';
}

interface ItemMatch extends MatchRule {
  start: number;
  end: number;
}

interface LogicalOffer {
  item: ItemMatch;
  start: number;
  end: number;
  transform?: ItemMatch;
}

interface PriceMatch {
  start: number;
  end: number;
  text: string;
  numeric: number;
  unit: string;
  explicitUnit: boolean;
}

interface QuantityMatch {
  start: number;
  end: number;
  quantity: number;
}

interface Section {
  text: string;
  forcedSide?: MarketSide;
}

const ACTION_HEADER = /\[(삼|삽니다|팜|팝니다)\]/g;
const PRICE_PATTERN =
  /(?<![\d.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*)(억|만|천원|천|원|전)?/g;
const RAW_GOLD_ITEMS = new Set([
  '녹호박단추',
  '청호박단추',
  '적호박단추',
  '늑대의이빨',
  '늑대의송곳니',
]);
const PUMPKIN_SUFFIX = /^(?:무기|류|단추|결정|보석|별|별검|별도|별곤|별봉)/;

export function normalizeMarketText(value: string) {
  // NFKC는 ㅍ/ㅅ/ㄷㅌㄹ 같은 호환 자모를 초성 코드로 바꿔 장터 축약어를
  // 깨뜨리므로 한글 자모를 보존하는 NFC만 적용한다.
  return value
    .normalize('NFC')
    .replace(/\[꾸\]|\(꾸\)/g, '[꾸밈]')
    .replace(/(\d+(?:\.\d+)?)\s*처넌/g, '$1천원')
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function overlaps(
  start: number,
  end: number,
  spans: Array<{ start: number; end: number }>,
) {
  return spans.some((span) => start < span.end && end > span.start);
}

function findSide(text: string): MarketSide | null {
  const hasSell = SELL_MARKER.test(text);
  const hasBuy = BUY_MARKER.test(text);
  if (hasSell === hasBuy) return null;
  return hasSell ? 'sell' : 'buy';
}

function splitActionSections(text: string): Section[] {
  const headers = [...text.matchAll(ACTION_HEADER)];
  if (!headers.length) return [{ text }];

  const sections: Section[] = [];
  const firstIndex = headers[0].index ?? 0;
  if (firstIndex > 0 && text.slice(0, firstIndex).trim()) {
    sections.push({ text: text.slice(0, firstIndex) });
  }

  headers.forEach((header, index) => {
    const start = (header.index ?? 0) + header[0].length;
    const end = headers[index + 1]?.index ?? text.length;
    const forcedSide: MarketSide = /^팜|^팝/.test(header[1]) ? 'sell' : 'buy';
    sections.push({ text: text.slice(start, end), forcedSide });
  });

  return sections;
}

function splitOutsideGrouping(text: string) {
  const sections: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && (char === '/' || char === ';' || char === '\n')) {
      const section = text.slice(start, index).trim();
      if (section) sections.push(section);
      while (text[index + 1] === '/') index += 1;
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) sections.push(tail);
  return sections;
}

function buildMatchRules(
  catalog: MarketCatalogItem[],
  transformContext: boolean,
): MatchRule[] {
  const byName = new Map(catalog.map((item) => [item.name, item]));
  const aliasRules = new Map<string, MatchRule>();

  for (const item of catalog) {
    // 장사 채널의 '도토리'는 게임 아이템이 아니라 현금 결제 수단으로 쓴다.
    if (CASH_MARKET_ALIASES.some((rule) => rule.canonicalName === item.name))
      continue;
    // [꾸밈]을 제거한 이름을 별칭으로 만들면 일반 장비와 꾸밈 장비가
    // 충돌한다. 정식 이름은 그대로만 등록하고 '꾸...' 축약은 명시 규칙으로 둔다.
    if (item.name.length >= 2)
      aliasRules.set(item.name, { alias: item.name, item, kind: 'exact' });
    const strippedCostumeName = item.name.startsWith('[꾸밈]')
      ? item.name.slice(4)
      : '';
    // 일반판이 도감에 없는 순수 외형 아이템만 괄호 생략을 허용한다.
    if (strippedCostumeName && !byName.has(strippedCostumeName)) {
      aliasRules.set(strippedCostumeName, {
        alias: strippedCostumeName,
        item,
        kind: 'exact',
      });
    }
  }

  for (const rule of MARKET_ITEM_ALIASES) {
    const item = byName.get(rule.canonicalName);
    if (!item) continue;
    for (const alias of rule.aliases) {
      if (!aliasRules.has(alias))
        aliasRules.set(alias, { alias, item, kind: 'alias' });
    }
  }

  if (transformContext) {
    for (const rule of TRANSFORM_CONTEXT_ALIASES) {
      const item = byName.get(rule.canonicalName);
      if (!item) continue;
      for (const alias of rule.aliases) {
        aliasRules.set(alias, { alias, item, kind: 'alias' });
      }
    }
  }

  return [...aliasRules.values()].sort(
    (a, b) => b.alias.length - a.alias.length,
  );
}

function findItems(text: string, rules: MatchRule[]): ItemMatch[] {
  const compactChars: string[] = [];
  const originalIndexes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/.test(text[index])) continue;
    compactChars.push(text[index]);
    originalIndexes.push(index);
  }
  const compactText = compactChars.join('');
  const candidates: ItemMatch[] = [];
  for (const rule of rules) {
    const compactAlias = rule.alias.replace(/\s+/g, '');
    let from = 0;
    while (from < compactText.length) {
      const compactStart = compactText.indexOf(compactAlias, from);
      if (compactStart < 0) break;
      const compactEnd = compactStart + compactAlias.length;
      const start = originalIndexes[compactStart];
      const end = originalIndexes[compactEnd - 1] + 1;
      const suffix = text.slice(end).trimStart();
      const isBarePumpkin = rule.item.name.endsWith('호박');
      if (!(isBarePumpkin && PUMPKIN_SUFFIX.test(suffix))) {
        candidates.push({ ...rule, start, end });
      }
      from = compactStart + Math.max(1, compactAlias.length);
    }
  }

  const selected: ItemMatch[] = [];
  for (const candidate of candidates.sort(
    (a, b) => b.alias.length - a.alias.length || a.start - b.start,
  )) {
    if (!overlaps(candidate.start, candidate.end, selected))
      selected.push(candidate);
  }
  return selected.sort((a, b) => a.start - b.start);
}

function createLogicalOffers(text: string, items: ItemMatch[]): LogicalOffer[] {
  const hasTransformMarker = TRANSFORM_MARKER.test(text);
  if (hasTransformMarker && items.length < 2) {
    const markerStart = text.search(TRANSFORM_MARKER);
    const markerEnd =
      markerStart + (text.match(TRANSFORM_MARKER)?.[0].length ?? 0);
    // '무기형변권'처럼 형변이 아이템 정식 명칭 자체에 포함된 경우는 일반
    // 아이템으로 취급한다. 그 외에는 베이스/외형 한쪽이 누락된 것이므로 보류한다.
    if (
      items.some((item) => item.start <= markerStart && item.end >= markerEnd)
    ) {
      return items.map((item) => ({ item, start: item.start, end: item.end }));
    }
    return [];
  }

  if (!hasTransformMarker && items.length === 2) {
    const preferred = items.filter((item) =>
      PREFERRED_TRANSFORM_BASES.has(item.item.name),
    );
    const [left, right] = items;
    const between = text.slice(left.end, right.start);
    const looksJoined = between.length <= 5 && !/[,/;]/.test(between);
    if (preferred.length === 1 && looksJoined) {
      const base = preferred[0];
      const transform = items.find((item) => item !== base)!;
      return [
        {
          item: base,
          transform,
          start: Math.min(base.start, transform.start),
          end: Math.max(base.end, transform.end),
        },
      ];
    }
  }

  if (!hasTransformMarker) {
    if (items.length === 1 && items[0].item.name.startsWith('[꾸밈]')) {
      const before = text.slice(0, items[0].start);
      // 알 수 없는 베이스 뒤 괄호 안에 외형만 잡힌 문장은 외형 아이템의
      // 단독 판매가 아니라 형변 설명일 가능성이 높으므로 자동 반영하지 않는다.
      if (before.lastIndexOf('(') > before.lastIndexOf(')')) return [];
    }
    return items.map((item) => ({ item, start: item.start, end: item.end }));
  }

  // 형변 문구에 아이템이 셋 이상이면 어떤 두 개가 한 쌍인지 확정하기 어렵다.
  if (items.length !== 2) return [];
  const preferred = items.filter((item) =>
    PREFERRED_TRANSFORM_BASES.has(item.item.name),
  );
  if (preferred.length !== 1) return [];

  const base = preferred[0];
  const transform = items.find((item) => item !== base);
  if (!transform || transform.item.name === base.item.name) return [];
  return [
    {
      item: base,
      transform,
      start: Math.min(base.start, transform.start),
      end: Math.max(base.end, transform.end),
    },
  ];
}

function findPrices(text: string, itemSpans: ItemMatch[]): PriceMatch[] {
  const prices: PriceMatch[] = [];
  for (const match of text.matchAll(PRICE_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, itemSpans)) continue;

    const following = text.slice(end).trimStart();
    const preceding = text.slice(0, start).trimEnd();
    if (
      /[+＋]$/.test(preceding) ||
      /^(?:가능|추금|추가금|차액|교환)/.test(following) ||
      /^(%|개(?=$|[\s(),./])|장(?=$|[\s(),./])|세트|셋|회(?=$|[\s(),./]))/.test(
        following,
      )
    ) {
      continue;
    }
    const numeric = Number(match[1].replace(/,/g, ''));
    const unit = match[2] ?? '';
    if (
      !Number.isFinite(numeric) ||
      numeric <= 0 ||
      numeric > 1_000_000_000_000
    ) {
      continue;
    }
    prices.push({
      start,
      end,
      text: match[0].trim(),
      numeric,
      unit,
      explicitUnit: Boolean(unit),
    });
  }
  return prices;
}

function findQuantity(
  text: string,
  itemEnd: number,
  nextItemStart: number,
): QuantityMatch | undefined {
  const context = text.slice(itemEnd, nextItemStart);
  const match = /(\d+)\s*개/.exec(context);
  if (!match) return undefined;
  const start = itemEnd + (match.index ?? 0);
  return {
    start,
    end: start + match[0].length,
    quantity: Number(match[1]),
  };
}

function implicitGoldMultiplier(itemName: string) {
  if (itemName === '황금호박') return 10_000;
  if (itemName.endsWith('호박') || RAW_GOLD_ITEMS.has(itemName)) return 1;
  return 10_000;
}

function toGoldPrice(price: PriceMatch, itemName: string) {
  const multiplier =
    price.unit === '억'
      ? 100_000_000
      : price.unit === '만'
        ? 10_000
        : price.unit === '천' || price.unit === '천원'
          ? 1_000
        : price.unit === '원' || price.unit === '전'
          ? 1
          : implicitGoldMultiplier(itemName);
  return Math.round(price.numeric * multiplier);
}

function cashAliasIn(value: string) {
  return CASH_PAYMENT_MARKER.test(value);
}

function parseCashInstrument(
  text: string,
  side: MarketSide,
): ParsedMarketQuote[] {
  const matches = CASH_MARKET_ALIASES.flatMap((rule) =>
    rule.aliases.flatMap((alias) => {
      const index = text.indexOf(alias);
      return index < 0 ? [] : [{ rule, alias, index }];
    }),
  ).sort((a, b) => b.alias.length - a.alias.length || a.index - b.index);
  const selected = matches[0];
  if (!selected) return [];

  const candidates = findPrices(text, []).filter((price) => {
    if (price.explicitUnit) return false;
    if (price.numeric < 0.1 || price.numeric > 10) return false;
    const following = text.slice(price.end).trimStart();
    return !/^개/.test(following);
  });
  const rate =
    candidates.find((price) => /비율/.test(text.slice(price.end, price.end + 5))) ??
    candidates.find((price) => price.text.includes('.')) ??
    candidates[0];
  if (!rate) return [];
  const quantityMatch = text.match(/(\d+)\s*개/);
  const priceCashWon = Math.round(rate.numeric * 10_000);
  return [
    {
      side,
      itemId: selected.rule.itemId,
      itemName: selected.rule.canonicalName,
      itemType: 'cash',
      quantity: quantityMatch ? Number(quantityMatch[1]) : 1,
      bundlePriceDivided: false,
      currency: 'cash',
      priceAmount: priceCashWon,
      priceCashWon,
      originalPriceText: rate.text,
      confidence: 0.98,
      matchedAlias: selected.alias,
      excludedFromGeneral: false,
    },
  ];
}

function findDye(
  text: string,
  start: number,
  end: number,
  itemSpans: ItemMatch[],
): string | undefined {
  let best: { name: string; length: number } | undefined;
  for (const dye of MARKET_DYE_ALIASES) {
    for (const alias of dye.aliases) {
      let index = text.indexOf(alias, start);
      while (index >= 0 && index < end) {
        const aliasEnd = index + alias.length;
        if (aliasEnd <= end && !overlaps(index, aliasEnd, itemSpans)) {
          if (!best || alias.length > best.length) {
            best = { name: dye.canonicalName, length: alias.length };
          }
        }
        index = text.indexOf(alias, index + Math.max(1, alias.length));
      }
    }
  }
  return best?.name;
}

function parseSection(
  section: Section,
  globalSide: MarketSide | null,
  catalog: MarketCatalogItem[],
): ParsedMarketQuote[] {
  const text = section.text.trim();
  if (!text) return [];
  const localSide = findSide(text);
  const side = section.forcedSide ?? localSide ?? globalSide;
  if (!side) return [];

  const transformContext = TRANSFORM_MARKER.test(text);
  const itemMatches = findItems(
    text,
    buildMatchRules(catalog, transformContext),
  );
  if (!itemMatches.length) return parseCashInstrument(text, side);
  const offers = createLogicalOffers(text, itemMatches);
  if (!offers.length) return [];
  const prices = findPrices(text, itemMatches);
  const pairedPrices = offers.map((offer, index) => {
    const nextStart = offers[index + 1]?.start ?? text.length;
    return prices.find(
      (entry) => entry.start >= offer.end && entry.start < nextStart,
    );
  });

  return offers.flatMap((offer, index) => {
    const previousEnd =
      index === 0 ? 0 : (pairedPrices[index - 1]?.end ?? offers[index - 1].end);
    const nextStart = offers[index + 1]?.start ?? text.length;
    const price = pairedPrices[index];
    if (!price) return [];

    const contextEnd = Math.max(nextStart, price.end);
    const dyeName = ['w', 'a', 'c'].includes(offer.item.item.type)
      ? findDye(text, previousEnd, contextEnd, itemMatches)
      : undefined;
    const context = text.slice(previousEnd, contextEnd);
    const durabilityMatch = context.match(/(100|\d{1,2})\s*%/);
    const quantityMatch = findQuantity(text, offer.item.end, nextStart);
    const betweenItemAndPrice = text.slice(offer.end, price.start);
    const immediatelyAfterPrice = text.slice(price.end, price.end + 12);
    const explicitlyGold = GOLD_PAYMENT_MARKER.test(context);
    const explicitlyCash =
      !explicitlyGold &&
      (cashAliasIn(betweenItemAndPrice) ||
        /^\s*(?:콩|도토리|도톨|ㄷㅌㄹ|두쫀쿠|뚜쫀쿠|쫀쿠)/.test(
          immediatelyAfterPrice,
        ));
    const silverBranchCash =
      !explicitlyGold &&
      !price.explicitUnit &&
      offer.item.item.name === '은나무가지' &&
      price.numeric < 1_000;
    const currency: MarketCurrency =
      explicitlyCash || silverBranchCash ? 'cash' : 'gold';
    const unadjustedPriceAmount =
      currency === 'cash'
        ? Math.round(
            price.numeric *
              (price.unit === '원' || price.unit === '전' ? 1 : 10_000),
          )
        : toGoldPrice(price, offer.item.item.name);
    const quantity = quantityMatch?.quantity ?? 1;
    const quantityBeforePrice = Boolean(
      quantityMatch && quantityMatch.end <= price.start,
    );
    const explicitlyPerUnit = /개당|개별|낱개|각개/.test(
      text.slice(offer.item.end, nextStart),
    );
    const bundlePriceDivided =
      quantity > 1 && quantityBeforePrice && !explicitlyPerUnit;
    const priceAmount = bundlePriceDivided
      ? Math.round(unadjustedPriceAmount / quantity)
      : unadjustedPriceAmount;
    if (priceAmount <= 0 || priceAmount > 1_000_000_000_000) return [];
    const exclusionReason = offer.transform
      ? ('transform' as const)
      : dyeName && PREMIUM_DYE_NAMES.has(dyeName)
        ? ('premium_dye' as const)
        : undefined;
    let confidence = offer.item.kind === 'exact' ? 0.99 : 0.96;
    if (!price.explicitUnit) confidence -= 0.01;
    if (offer.transform) confidence -= 0.01;

    return [
      {
        side,
        itemId: offer.item.item.id,
        itemName: offer.item.item.name,
        itemType: offer.item.item.type,
        dyeName,
        transformItemId: offer.transform?.item.id,
        transformItemName: offer.transform?.item.name,
        durability: durabilityMatch ? Number(durabilityMatch[1]) : undefined,
        quantity,
        bundlePriceDivided,
        bundleTotalPriceAmount: bundlePriceDivided
          ? unadjustedPriceAmount
          : undefined,
        currency,
        priceAmount,
        priceGold: currency === 'gold' ? priceAmount : undefined,
        priceCashWon: currency === 'cash' ? priceAmount : undefined,
        originalPriceText: price.text,
        confidence: Math.max(0, Number(confidence.toFixed(2))),
        matchedAlias: offer.item.alias,
        excludedFromGeneral: Boolean(exclusionReason),
        exclusionReason,
      },
    ];
  });
}

export function parseMarketMessage(
  content: string,
  catalog: MarketCatalogItem[],
): ParsedMarketQuote[] {
  const normalized = normalizeMarketText(content);
  const globalSide = findSide(normalized);
  const actionSections = splitActionSections(normalized);
  const strongSections = actionSections.flatMap((section) =>
    splitOutsideGrouping(section.text)
      .map((text) => ({ text, forcedSide: section.forcedSide }))
      .filter((entry) => entry.text.trim()),
  );
  return strongSections.flatMap((section) =>
    parseSection(section, globalSide, catalog),
  );
}
