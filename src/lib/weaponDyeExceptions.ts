import fs from 'node:fs';
import path from 'node:path';

export type WeaponDyeWeaponType = 'sword' | 'spear' | 'fan';

export interface WeaponDyeExceptionEntry {
  paletteRows: number[];
  keepOriginalIndices: number[];
  forceDyeIndices: number[];
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
    ...(typeof input?.note === 'string' && input.note.trim()
      ? { note: input.note.trim() }
      : {}),
  };
}

function normalizeFile(input?: Partial<WeaponDyeExceptionFile> | null): WeaponDyeExceptionFile {
  const empty = createEmptyWeaponDyeExceptionFile();
  const weapons = input?.weapons ?? {};

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
) {
  const entry = loadWeaponDyeExceptions().weapons[weaponType]?.[String(weaponNum)];

  if (!entry) {
    return fallbackUseOriginalPalette;
  }

  if (entry.paletteRows.length > 0 && !entry.paletteRows.includes(paletteRow)) {
    return fallbackUseOriginalPalette;
  }

  if (entry.keepOriginalIndices.includes(idx)) {
    return true;
  }

  if (entry.forceDyeIndices.includes(idx)) {
    return false;
  }

  return fallbackUseOriginalPalette;
}
