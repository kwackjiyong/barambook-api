import * as path from 'node:path'; // ← 또는 'path'
import * as fs from 'node:fs';
import { EpfFile, PaletteSet, PaletteVariant, Rgb, Tbl } from './types';

const ASSETS_ROOT = path.resolve(path.join(process.cwd(), 'src', 'assets'));

function loadJSON<T = any>(p: string): T {
  const buf = fs.readFileSync(p, 'utf-8');
  return JSON.parse(buf) as T;
}

export function assetPath(...p: string[]) {
  return path.join(ASSETS_ROOT, ...p);
}

// Accepts either legacy Rgb[][] or new { colors, animationColorCount, animationOffsets }[].
// Legacy entries are normalized with no animation metadata.
function loadPaletteSet(filePath: string): PaletteSet {
  const raw = loadJSON<unknown>(filePath);
  if (!Array.isArray(raw)) {
    throw new Error(`Palette file is not an array: ${filePath}`);
  }
  return raw.map((entry, i): PaletteVariant => {
    if (Array.isArray(entry)) {
      return {
        colors: entry as Rgb[],
        animationColorCount: 0,
        animationOffsets: [],
      };
    }
    const e = entry as Partial<PaletteVariant>;
    if (!Array.isArray(e.colors)) {
      throw new Error(`Palette[${i}] missing colors in ${filePath}`);
    }
    return {
      colors: e.colors,
      animationColorCount: e.animationColorCount ?? 0,
      animationOffsets: e.animationOffsets ?? [],
    };
  });
}

// EPF files
export const EPF = {
  head: loadJSON<EpfFile>(assetPath('epf', 'head_epf.json')),
  body: loadJSON<EpfFile>(assetPath('epf', 'body_epf.json')),
  sword: loadJSON<EpfFile>(assetPath('epf', 'sword_epf.json')),
  swordSP: loadJSON<EpfFile>(assetPath('epf', 'sword_sp_epf.json')),
  spear: loadJSON<EpfFile>(assetPath('epf', 'spear_epf.json')),
  shield: loadJSON<EpfFile>(assetPath('epf', 'shield_epf.json')),
  emotion: loadJSON<EpfFile>(assetPath('epf', 'emotion_epf.json')),
  fan: loadJSON<EpfFile>(assetPath('epf', 'fan_epf.json')),
  ghost: loadJSON<EpfFile>(assetPath('epf', 'ghost_epf.json')),
};

// Palette sets
export const PAL = {
  head: loadPaletteSet(assetPath('pal', 'head_pal.json')),
  body: loadPaletteSet(assetPath('pal', 'body_pal.json')),
  weapon: loadPaletteSet(assetPath('pal', 'weapon_pal.json')), // 무기 염색용
  sword: loadPaletteSet(assetPath('pal', 'sword_pal.json')),
  spear: loadPaletteSet(assetPath('pal', 'spear_pal.json')),
  shield: loadPaletteSet(assetPath('pal', 'shield_pal.json')),
  emotion: loadPaletteSet(assetPath('pal', 'emotion_pal.json')),
  fan: loadPaletteSet(assetPath('pal', 'fan_pal.json')),
};

// Table mapping (sequence -> base frame offset)
export const TBL = {
  head: loadJSON<Tbl>(assetPath('tbl', 'head.json')),
  body: loadJSON<Tbl>(assetPath('tbl', 'body.json')),
  sword: loadJSON<Tbl>(assetPath('tbl', 'sword.json')),
  spear: loadJSON<Tbl>(assetPath('tbl', 'spear.json')),
  shield: loadJSON<Tbl>(assetPath('tbl', 'shield.json')),
  fan: loadJSON<Tbl>(assetPath('tbl', 'fan.json')),
  order: loadJSON<string[]>(assetPath('tbl', 'drworder.json')),
};

export function framesPerSequence(tbl: Tbl): number {
  if (tbl.length < 2) return 1;
  return Math.max(1, Math.abs(tbl[1]._u3 - tbl[0]._u3));
}
