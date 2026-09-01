export const GACHA_CATEGORIES = [
  { value: 'cash', label: '판매 상자' },
  { value: 'monthly', label: '월간 환기' },
  { value: 'pickup', label: '픽업 뽑기' },
  { value: 'event', label: '이벤트' },
  { value: 'ranking', label: '랭킹 보상' },
] as const;

export type GachaCategory = (typeof GACHA_CATEGORIES)[number]['value'];

export const GACHA_CATEGORY_ORDER: Record<GachaCategory, number> =
  Object.fromEntries(
    GACHA_CATEGORIES.map((category, index) => [category.value, index]),
  ) as Record<GachaCategory, number>;
