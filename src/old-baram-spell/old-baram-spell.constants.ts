// SpellInfo의 직업 컬럼은 한글 열 이름 그대로다.
export const OLD_BARAM_JOBS = [
  { value: 1, label: '전사', column: '전사' },
  { value: 2, label: '도적', column: '도적' },
  { value: 3, label: '주술사', column: '술사' },
  { value: 4, label: '도사', column: '도사' },
] as const;

// 원본 type 코드는 의미가 확정되지 않아 노출하지 않는다.
// 대신 습득 조건·몬스터 사용 여부처럼 확실한 사실로만 분류한다.
export const OLD_BARAM_SPELL_CATEGORIES = [
  { value: 'learnable', label: '습득 마법' },
  { value: 'mob', label: '몬스터 사용' },
  { value: 'other', label: '기타' },
] as const;

export type OldBaramSpellCategory =
  (typeof OLD_BARAM_SPELL_CATEGORIES)[number]['value'];
