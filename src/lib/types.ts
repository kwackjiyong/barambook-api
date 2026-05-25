export type Part = 'head' | 'body' | 'weapon' | 'spear' | 'shield' | 'fan';

export interface EpfItem {
  top: number;
  left: number;
  bottom: number;
  right: number;
  pixel: string; // base64 stream of palette indices
  maskRows: string[]; // base64 rows with RLE ops
}

export interface EpfFile {
  items: EpfItem[];
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaletteVariant {
  colors: Rgb[]; // length = 256
  animationColorCount: number; // 0 when no color cycling
  animationOffsets: number[]; // raw uint16 LE shorts from .pal (length == animationColorCount)
}
export type PaletteSet = PaletteVariant[]; // variants

export interface TblRow {
  _u1: number;
  _u2: number;
  _u3: number;
}
export type Tbl = TblRow[];

export interface RenderParams {
  head: number;
  headc: number;
  body: number;
  bodyc: number;
  weapon: number;
  weaponrc: number;
  weaponc: number;
  weaponAnic?: number;
  shield: number;
  shieldc: number;
  frame: number;
  width?: number;
  height?: number;
  isAction?: boolean;
  // Tick index for PAL-driven color cycling. Each tick rotates colors within
  // every animation range by 1 position. Defaults to 0 (no rotation).
  colorTick?: number;
}

export interface DecodedBitmap {
  w: number;
  h: number;
  left: number;
  top: number;
  rgba: Uint8ClampedArray; // length = w*h*4
}
