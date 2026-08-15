export const GAME_MARKET_RULE_VERSION = '2026-08-16.6';

export interface MarketAliasRule {
  canonicalName: string;
  aliases: string[];
}

// 장사 채널에서 반복적으로 쓰는 축약어만 명시한다. 정식 명칭은 아이템
// 도감 전체를 런타임에 불러와 이 목록보다 먼저(긴 문자열 우선) 매칭한다.
export const MARKET_ITEM_ALIASES: MarketAliasRule[] = [
  { canonicalName: '괴력선창', aliases: ['괴력', '괴선'] },
  { canonicalName: '심판의낫', aliases: ['심낫'] },
  { canonicalName: '등대빛의검', aliases: ['등빛'] },
  { canonicalName: '녹호박별검', aliases: ['녹별검'] },
  { canonicalName: '녹호박별도', aliases: ['녹별도'] },
  { canonicalName: '녹호박별곤', aliases: ['녹별곤'] },
  { canonicalName: '녹호박별봉', aliases: ['녹별봉'] },
  { canonicalName: '주술갑옷', aliases: ['주갑'] },
  { canonicalName: '해골갑옷', aliases: ['해갑'] },
  { canonicalName: '[꾸밈]주술갑옷', aliases: ['꾸주갑', '꾸주술갑옷'] },
  { canonicalName: '[꾸밈]해골갑옷', aliases: ['꾸해갑', '꾸해골갑옷'] },
  { canonicalName: '진일신검', aliases: ['진일'] },
  { canonicalName: '[꾸밈]진일신검', aliases: ['꾸진일', '꾸진일신검'] },
  { canonicalName: '청일기창', aliases: ['청일'] },
  { canonicalName: '[꾸밈]청일기창', aliases: ['꾸청일', '꾸청일기창'] },
  { canonicalName: '적화접선', aliases: ['적화'] },
  { canonicalName: '[꾸밈]적화접선', aliases: ['꾸적화', '꾸적화접선'] },
  { canonicalName: '황염곤봉', aliases: ['황염'] },
  { canonicalName: '[꾸밈]황염곤봉', aliases: ['꾸황염', '꾸황염곤봉'] },
  { canonicalName: '은나무가지', aliases: ['은가'] },
];

export interface CashMarketAliasRule extends MarketAliasRule {
  itemId: number;
}

// 실제 게임 아이템 도토리가 아니라 장사 채널에서 현금 결제 수단을
// 가리키는 표현이다. 음수 ID를 사용해 게임 아이템 도감과 충돌하지 않는다.
export const CASH_MARKET_ALIASES: CashMarketAliasRule[] = [
  {
    itemId: -1,
    canonicalName: '도토리',
    aliases: ['도토리', '도톨', 'ㄷㅌㄹ'],
  },
  {
    itemId: -2,
    canonicalName: '쫀쿠',
    aliases: ['쫀쿠', '두쫀쿠', '뚜쫀쿠'],
  },
];

export const CASH_PAYMENT_MARKER = /도토리|도톨|ㄷㅌㄹ|두쫀쿠|뚜쫀쿠|쫀쿠|그거|콩/;
export const GOLD_PAYMENT_MARKER = /바돈|바람(?:의나라)?\s*금전/;

// 형변 문맥에서만 일반 축약어의 의미를 외형 아이템으로 바꾼다.
export const TRANSFORM_CONTEXT_ALIASES: MarketAliasRule[] = [
  { canonicalName: '[꾸밈]진일신검', aliases: ['진일'] },
];

export const PREFERRED_TRANSFORM_BASES = new Set([
  '괴력선창',
  '심판의낫',
  '등대빛의검',
  '녹호박별검',
  '녹호박별도',
  '녹호박별곤',
  '녹호박별봉',
  '주술갑옷',
  '해골갑옷',
]);

export const MARKET_DYE_ALIASES: Array<{
  canonicalName: string;
  aliases: string[];
}> = [
  { canonicalName: '은묵', aliases: ['은묵'] },
  { canonicalName: '홍몽', aliases: ['홍몽'] },
  { canonicalName: '남청결', aliases: ['남청결'] },
  { canonicalName: '진분홍색', aliases: ['진분홍', '진핑'] },
  { canonicalName: '황금색', aliases: ['황금색', '황금'] },
  { canonicalName: '검정색', aliases: ['검정색', '검정', '검'] },
  { canonicalName: '노란색', aliases: ['노란색', '노랑', '노란'] },
  { canonicalName: '분홍색', aliases: ['분홍색', '분홍'] },
  { canonicalName: '보라색', aliases: ['보라색', '보라'] },
  { canonicalName: '빨간색', aliases: ['빨간색', '빨강', '빨간'] },
  { canonicalName: '파란색', aliases: ['파란색', '파랑', '파란'] },
  { canonicalName: '초록색', aliases: ['초록색', '초록', '녹색'] },
];

export const PREMIUM_DYE_NAMES = new Set(['홍몽', '남청결', '은묵']);

export const SELL_MARKER = /팝니다|팜니다|판매|급처|팜|ㅍ+/;
export const BUY_MARKER = /삽니다|사요|구매|구함|ㅅ{2,}|(?:\d|\s)삼(?:$|\s|\/)/;
export const TRANSFORM_MARKER = /형상변환|형변/;

export function resolveMarketSearchAlias(value: string) {
  const normalized = value.trim();
  for (const rule of [
    ...MARKET_ITEM_ALIASES,
    ...TRANSFORM_CONTEXT_ALIASES,
    ...CASH_MARKET_ALIASES,
  ]) {
    if (rule.aliases.includes(normalized)) return rule.canonicalName;
  }
  return normalized;
}
