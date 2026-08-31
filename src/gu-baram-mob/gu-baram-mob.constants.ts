// 원본에 등급 열이 없어 체력만으로 나눈 화면용 구분이다.
export const GU_BARAM_MOB_TIERS = [
  { value: 'low', label: '1만 미만', min: 0, max: 10_000 },
  { value: 'mid', label: '1만 ~ 10만', min: 10_000, max: 100_000 },
  { value: 'high', label: '10만 ~ 100만', min: 100_000, max: 1_000_000 },
  { value: 'boss', label: '100만 이상', min: 1_000_000, max: Infinity },
] as const;

export type GuBaramMobTier = (typeof GU_BARAM_MOB_TIERS)[number]['value'];

export const GU_BARAM_MOB_TIER_VALUES = GU_BARAM_MOB_TIERS.map(
  (tier) => tier.value,
);

export const GU_BARAM_MOB_SORTS = ['id', 'name', 'hpDesc', 'hpAsc'] as const;

export type GuBaramMobSort = (typeof GU_BARAM_MOB_SORTS)[number];
