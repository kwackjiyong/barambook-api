export const GU_BARAM_SHOP_SORTS = ['id', 'count'] as const;

export type GuBaramShopSort = (typeof GU_BARAM_SHOP_SORTS)[number];

// 상점 검색은 두 갈래다. 번호·성격으로 찾거나, 파는 물건 이름으로 찾는다.
export const GU_BARAM_SHOP_SEARCH_MODES = [
  { value: 'shop', label: '상점으로 찾기' },
  { value: 'item', label: '파는 물건으로 찾기' },
] as const;

export const GU_BARAM_SHOP_SEARCH_MODE_VALUES = GU_BARAM_SHOP_SEARCH_MODES.map(
  (entry) => entry.value,
);

export type GuBaramShopSearchMode =
  (typeof GU_BARAM_SHOP_SEARCH_MODES)[number]['value'];
