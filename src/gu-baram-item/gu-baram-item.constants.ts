// 원본 표 이름에서 온 착용 부위. 사용자가 고르는 분류는 이쪽이다.
export const GU_BARAM_ITEM_GROUPS = [
  { value: 'weapon', label: '무기' },
  { value: 'armor', label: '갑옷' },
  { value: 'helmet', label: '투구' },
  { value: 'shield', label: '방패' },
  { value: 'accessory', label: '장신구' },
  { value: 'consumable', label: '소비품' },
  { value: 'scriptable', label: '스크립트 물품' },
  { value: 'etc', label: '기타' },
] as const;

export const GU_BARAM_ITEM_GROUP_VALUES = GU_BARAM_ITEM_GROUPS.map(
  (entry) => entry.value,
);

export type GuBaramItemGroup = (typeof GU_BARAM_ITEM_GROUPS)[number]['value'];

// 클라이언트의 ItemType enum 그대로다.
export const GU_BARAM_ITEM_TYPES = [
  { value: 0, label: '무기' },
  { value: 1, label: '갑옷' },
  { value: 2, label: '방패' },
  { value: 3, label: '투구' },
  { value: 4, label: '장신구' },
  { value: 5, label: '장신구2' },
  { value: 6, label: '내구도 소비품' },
  { value: 7, label: '소비품' },
  { value: 8, label: '스크립트 물품' },
  { value: 9, label: '돈' },
  { value: 10, label: '일반' },
  { value: 11, label: '묶음 가능' },
  { value: 12, label: '화살' },
] as const;

// JobType enum. 0은 제한 없음이다.
export const GU_BARAM_JOBS = [
  { value: 1, label: '전사' },
  { value: 2, label: '도적' },
  { value: 3, label: '주술사' },
  { value: 4, label: '도사' },
  { value: 5, label: 'GM' },
] as const;

export const GU_BARAM_GENDERS = [
  { value: 1, label: '남성' },
  { value: 2, label: '여성' },
] as const;

export const GU_BARAM_ITEM_SORTS = ['id', 'name', 'level', 'price'] as const;

export type GuBaramItemSort = (typeof GU_BARAM_ITEM_SORTS)[number];

export function guBaramItemGroupName(group: string) {
  return (
    GU_BARAM_ITEM_GROUPS.find((entry) => entry.value === group)?.label ?? group
  );
}

export function guBaramItemTypeName(type: number) {
  return (
    GU_BARAM_ITEM_TYPES.find((entry) => entry.value === type)?.label ??
    `분류 ${type}`
  );
}
