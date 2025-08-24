import * as path from 'node:path'; // ← 또는 'path'
import * as fs from 'node:fs';
import { EpfFile, PaletteSet, Tbl } from './types';

const ASSETS_ROOT = path.resolve(path.join(process.cwd(), 'src', 'assets'));

function loadJSON<T = any>(p: string): T {
  const buf = fs.readFileSync(p, 'utf-8');
  return JSON.parse(buf) as T;
}

export function assetPath(...p: string[]) {
  return path.join(ASSETS_ROOT, ...p);
}

// EPF files
export const EPF = {
  head: loadJSON<EpfFile>(assetPath('epf', 'head_epf.json')),
  body: loadJSON<EpfFile>(assetPath('epf', 'body_epf.json')),
  sword: loadJSON<EpfFile>(assetPath('epf', 'sword_epf.json')),
  spear: loadJSON<EpfFile>(assetPath('epf', 'spear_epf.json')),
  shield: loadJSON<EpfFile>(assetPath('epf', 'shield_epf.json')),
  emotion: loadJSON<EpfFile>(assetPath('epf', 'emotion_epf.json')),
  fan: loadJSON<EpfFile>(assetPath('epf', 'fan_epf.json')),
};

// Palette sets
export const PAL = {
  head: loadJSON<PaletteSet>(assetPath('pal', 'head_pal.json')),
  body: loadJSON<PaletteSet>(assetPath('pal', 'body_pal.json')),
  sword: loadJSON<PaletteSet>(assetPath('pal', 'sword_pal.json')),
  spear: loadJSON<PaletteSet>(assetPath('pal', 'spear_pal.json')),
  shield: loadJSON<PaletteSet>(assetPath('pal', 'shield_pal.json')),
  emotion: loadJSON<PaletteSet>(assetPath('pal', 'emotion_pal.json')),
  fan: loadJSON<PaletteSet>(assetPath('pal', 'fan_pal.json')),
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
