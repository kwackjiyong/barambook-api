import * as fs from 'node:fs';
import * as path from 'node:path';

export type WeaponDyeWeaponType = 'sword' | 'spear' | 'fan';

export interface WeaponDyeHeightRange {
  startY: number;
  endY: number;
}

export interface WeaponDyeExceptionEntry {
  paletteRows: number[];
  keepOriginalIndices: number[];
  forceDyeIndices: number[];
  forceDyeHeightRanges: WeaponDyeHeightRange[];
  note?: string;
}

export interface WeaponDyeExceptionFile {
  version: number;
  updatedAt: string;
  weapons: Record<WeaponDyeWeaponType, Record<string, WeaponDyeExceptionEntry>>;
}

const DEFAULT_FILE_PATH = path.resolve(
  process.cwd(),
  '..',
  'barambook',
  'public',
  'asset',
  'render-json',
  'weapon-dye-exceptions.json',
);

let cachedMtimeMs = -1;
let cachedFile: WeaponDyeExceptionFile = createEmptyWeaponDyeExceptionFile();

function toSortedUniqueIndices(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => Number(value) | 0))]
    .filter((value) => value >= 0 && value <= 255)
    .sort((left, right) => left - right);
}

function toSortedUniquePaletteRows(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => Number(value) | 0))]
    .filter((value) => value >= 0)
    .sort((left, right) => left - right);
}

function normalizeWeaponDyeHeightRanges(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  const ranges = values
    .map((value) => {
      if (!value || typeof value !== 'object') {
        return null;
      }

      const { startY, endY } = value as Partial<WeaponDyeHeightRange>;
      const rawStartY = Number(startY);
      const rawEndY = Number(endY);

      if (!Number.isFinite(rawStartY) || !Number.isFinite(rawEndY)) {
        return null;
      }

      const normalizedStartY = Math.max(0, Math.trunc(Math.min(rawStartY, rawEndY)));
      const normalizedEndY = Math.max(0, Math.trunc(Math.max(rawStartY, rawEndY)));

      return {
        startY: normalizedStartY,
        endY: normalizedEndY,
      } satisfies WeaponDyeHeightRange;
    })
    .filter((value): value is WeaponDyeHeightRange => value !== null)
    .sort((left, right) => {
      if (left.startY !== right.startY) {
        return left.startY - right.startY;
      }

      return left.endY - right.endY;
    });

  const merged: WeaponDyeHeightRange[] = [];

  for (const range of ranges) {
    const previous = merged[merged.length - 1];

    if (!previous || range.startY > previous.endY + 1) {
      merged.push({ ...range });
      continue;
    }

    previous.endY = Math.max(previous.endY, range.endY);
  }

  return merged;
}

export function isWeaponDyeHeightForcedAtY(
  ranges: WeaponDyeHeightRange[] | null | undefined,
  y: number,
) {
  if (!Array.isArray(ranges) || !Number.isInteger(y) || y < 0) {
    return false;
  }

  return ranges.some((range) => y >= range.startY && y <= range.endY);
}

export function createEmptyWeaponDyeExceptionFile(): WeaponDyeExceptionFile {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    weapons: {
      sword: {},
      spear: {},
      fan: {},
    },
  };
}

function normalizeEntry(input?: Partial<WeaponDyeExceptionEntry> | null): WeaponDyeExceptionEntry {
  return {
    paletteRows: toSortedUniquePaletteRows(input?.paletteRows),
    keepOriginalIndices: toSortedUniqueIndices(input?.keepOriginalIndices),
    forceDyeIndices: toSortedUniqueIndices(input?.forceDyeIndices),
    forceDyeHeightRanges: normalizeWeaponDyeHeightRanges(input?.forceDyeHeightRanges),
    ...(typeof input?.note === 'string' && input.note.trim()
      ? { note: input.note.trim() }
      : {}),
  };
}

function normalizeFile(input?: Partial<WeaponDyeExceptionFile> | null): WeaponDyeExceptionFile {
  const empty = createEmptyWeaponDyeExceptionFile();
  const weapons = (input?.weapons ?? {}) as Partial<
    Record<WeaponDyeWeaponType, Record<string, Partial<WeaponDyeExceptionEntry>>>
  >;

  const normalizeGroup = (weaponType: WeaponDyeWeaponType) => {
    const group = weapons[weaponType];

    if (!group || typeof group !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(group)
        .filter(([weaponNum]) => /^\d+$/.test(weaponNum))
        .map(([weaponNum, entry]) => [weaponNum, normalizeEntry(entry)]),
    );
  };

  return {
    version: Number(input?.version) > 0 ? Number(input?.version) : empty.version,
    updatedAt:
      typeof input?.updatedAt === 'string' && input.updatedAt
        ? input.updatedAt
        : empty.updatedAt,
    weapons: {
      sword: normalizeGroup('sword'),
      spear: normalizeGroup('spear'),
      fan: normalizeGroup('fan'),
    },
  };
}

export function loadWeaponDyeExceptions() {
  try {
    const stat = fs.statSync(DEFAULT_FILE_PATH);

    if (stat.mtimeMs !== cachedMtimeMs) {
      cachedFile = normalizeFile(
        JSON.parse(fs.readFileSync(DEFAULT_FILE_PATH, 'utf8')) as Partial<WeaponDyeExceptionFile>,
      );
      cachedMtimeMs = stat.mtimeMs;
    }
  } catch {
    cachedFile = createEmptyWeaponDyeExceptionFile();
    cachedMtimeMs = -1;
  }

  return cachedFile;
}

export function applyWeaponDyeExceptionDecision(
  fallbackUseOriginalPalette: boolean,
  weaponType: WeaponDyeWeaponType,
  weaponNum: number,
  paletteRow: number,
  idx: number,
  y: number,
) {
  const entry = loadWeaponDyeExceptions().weapons[weaponType]?.[String(weaponNum)];

  if (!entry) {
    return fallbackUseOriginalPalette;
  }

  if (entry.paletteRows.length > 0 && !entry.paletteRows.includes(paletteRow)) {
    return fallbackUseOriginalPalette;
  }

  if (isWeaponDyeHeightForcedAtY(entry.forceDyeHeightRanges, y)) {
    return false;
  }

  if (entry.keepOriginalIndices.includes(idx)) {
    return true;
  }

  if (entry.forceDyeIndices.includes(idx)) {
    return false;
  }

  return fallbackUseOriginalPalette;
}
