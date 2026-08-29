// MobData.size는 s(작은 대상)와 l(큰 대상) 두 가지다.
// 아이템의 파괴력이 작은 대상/큰 대상으로 나뉘는 것과 같은 구분이다.
export const OLD_BARAM_MOB_SIZES = [
  { value: 's', label: '작은 대상' },
  { value: 'l', label: '큰 대상' },
] as const;

export function oldBaramMobSizeName(size: string) {
  return (
    OLD_BARAM_MOB_SIZES.find((entry) => entry.value === size)?.label ?? size
  );
}

export const OLD_BARAM_MOB_SORTS = ['id', 'name', 'exp', 'hp', 'ac'] as const;

export type OldBaramMobSort = (typeof OLD_BARAM_MOB_SORTS)[number];
