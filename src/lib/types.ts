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
export type PaletteVariant = Rgb[]; // length = 256
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
  weaponc: number;
  shield: number;
  shieldc: number;
  frame: number;
  width?: number;
  height?: number;
}

export interface DecodedBitmap {
  w: number;
  h: number;
  left: number;
  top: number;
  rgba: Uint8ClampedArray; // length = w*h*4
}
