import type { CharMsItemNameTable } from './format';

/**
 * `char-ms-item-names.json` 병합.
 *
 * 이름·별칭·기본 컬러는 char-ms.dat보다 자주 바뀌므로 dat을 다시 굽지 않고
 * 별도 JSON으로 덮어쓴다. 파일이 없거나 형식이 달라도 dat에 들어 있는 이름이
 * 그대로 쓰이도록 실패는 조용히 무시한다.
 *
 * 원본은 barambook-render-app의 `data/char-ms-item-names.json`이며
 * `buildMswItemNames`와 같은 규칙으로 갑옷·무기·방패만 덮어쓴다.
 * 머리·얼굴·헤어·탈것 이름은 메월 월드 테이블 값이라 dat 쪽을 유지한다.
 */

const EDITABLE_FORMAT = 'char-ms-editable-item-names';
const OVERRIDABLE_PARTS = ['armor', 'weapon', 'shield'] as const;

interface EditableEntry {
  id: number | string;
  name?: string;
  color?: number;
  aliases?: string[];
}

export interface EditableItemNames {
  format?: string;
  version?: number;
  colorPresets?: Record<string, Array<{ name?: string; color?: number }>>;
  armor?: EditableEntry[];
  weapon?: EditableEntry[];
  shield?: EditableEntry[];
}

export function isEditableItemNames(
  value: unknown,
): value is EditableItemNames {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as EditableItemNames).format === EDITABLE_FORMAT
  );
}

function toColorPresets(editable: EditableItemNames) {
  return Object.fromEntries(
    Object.entries(editable.colorPresets ?? {}).map(([logicalPart, rows]) => [
      logicalPart,
      (Array.isArray(rows) ? rows : [])
        .map((row) => ({
          name: String(row?.name ?? '').trim(),
          color: Number(row?.color),
        }))
        .filter(
          (row) =>
            row.name &&
            Number.isInteger(row.color) &&
            row.color >= 0 &&
            row.color < 255,
        )
        .map((row) => [row.color, row.name] as [number, string]),
    ]),
  );
}

/** char-ms.dat의 compact records 위에 편집본 이름을 덮어쓴 새 테이블을 만든다. */
export function mergeCharMsItemNames(
  embedded: CharMsItemNameTable | null,
  editable: EditableItemNames | null,
): CharMsItemNameTable | null {
  if (!editable) {
    return embedded;
  }

  const overrideByKey = new Map<
    string,
    { name: string; aliases: string[]; defaultColorIndex: number }
  >();

  for (const logicalPart of OVERRIDABLE_PARTS) {
    for (const entry of editable[logicalPart] ?? []) {
      const name = String(entry?.name ?? '').trim();
      const color = Number(entry?.color);
      const aliases = [
        ...new Set(
          (entry?.aliases ?? [])
            .map((alias) => String(alias).trim())
            .filter((alias) => alias && alias !== name),
        ),
      ];

      overrideByKey.set(`${logicalPart} ${entry?.id}`, {
        name,
        aliases,
        defaultColorIndex: Number.isInteger(color) && color >= 0 ? color : 0,
      });
    }
  }

  const records = (embedded?.records ?? []).map((record) => {
    const override = overrideByKey.get(`${record[0]} ${record[1]}`);

    if (!override) {
      return record;
    }

    return [
      record[0],
      record[1],
      override.name || record[2],
      record[3],
      override.name || override.aliases.length
        ? 'char-ms-item-names.json'
        : record[4],
      override.aliases.length ? override.aliases : record[5],
      override.defaultColorIndex,
    ] as typeof record;
  });

  const colorPresets = toColorPresets(editable);

  return {
    format: embedded?.format ?? 'char-ms-item-names',
    version: embedded?.version ?? 3,
    colorPresets: Object.keys(colorPresets).length
      ? colorPresets
      : embedded?.colorPresets,
    records,
  };
}
