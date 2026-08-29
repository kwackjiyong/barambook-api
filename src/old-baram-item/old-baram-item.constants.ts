export const OLD_BARAM_ITEM_TYPES = [
  { value: 0, label: '무기' },
  { value: 1, label: '갑옷' },
  { value: 2, label: '방패' },
  { value: 3, label: '투구' },
  { value: 4, label: '손 장비' },
  { value: 5, label: '보조 장비' },
  { value: 6, label: '음식·주류' },
  { value: 7, label: '일반 물품' },
  { value: 8, label: '사용 물품' },
  { value: 9, label: '화폐' },
  { value: 10, label: '재료' },
  { value: 11, label: '특수 물품' },
] as const;

export const OLD_BARAM_JOBS = [
  { value: 1, label: '전사' },
  { value: 2, label: '도적' },
  { value: 3, label: '주술사' },
  { value: 4, label: '도사' },
] as const;

export const OLD_BARAM_GENDERS = [
  { value: 1, label: '남성' },
  { value: 2, label: '여성' },
] as const;

export function oldBaramItemTypeName(type: number) {
  return (
    OLD_BARAM_ITEM_TYPES.find((entry) => entry.value === type)?.label ??
    `분류 ${type}`
  );
}
