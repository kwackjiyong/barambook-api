// SkillInputType enum. DIE_* 는 죽은 상태에서도 시전할 수 있는 것들이다.
export const GU_BARAM_SKILL_INPUTS = [
  { value: 1, label: '값을 입력해 시전' },
  { value: 2, label: '대상을 골라 시전' },
  { value: 5, label: '바로 시전' },
  { value: 8, label: '죽은 채로 값 입력' },
  { value: 9, label: '죽은 채로 대상 지정' },
  { value: 12, label: '죽은 채로 바로 시전' },
] as const;

export const GU_BARAM_SKILL_INPUT_VALUES = GU_BARAM_SKILL_INPUTS.map(
  (entry) => entry.value,
);

export const GU_BARAM_SKILL_CATEGORIES = [
  { value: 'buff', label: '버프 효과가 붙는 스킬' },
  { value: 'death', label: '죽은 채로 쓰는 스킬' },
  { value: 'prompt', label: '값을 입력하는 스킬' },
] as const;

export const GU_BARAM_SKILL_CATEGORY_VALUES = GU_BARAM_SKILL_CATEGORIES.map(
  (entry) => entry.value,
);

export type GuBaramSkillCategory =
  (typeof GU_BARAM_SKILL_CATEGORIES)[number]['value'];

export const GU_BARAM_SKILL_SORTS = ['id', 'name'] as const;

export type GuBaramSkillSort = (typeof GU_BARAM_SKILL_SORTS)[number];

export function guBaramSkillInputName(inputType: number) {
  return (
    GU_BARAM_SKILL_INPUTS.find((entry) => entry.value === inputType)?.label ??
    `입력 ${inputType}`
  );
}
