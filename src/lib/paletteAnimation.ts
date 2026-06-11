import { PAL, TBL } from './assets';
import { PaletteVariant, RenderParams, Rgb } from './types';

// Decoded form of a single animationOffset short.
// PAL stores it as a 16-bit LE short whose two bytes encode a color-index
// range. The current interpretation:
//   start = min(highByte, lowByte)
//   end   = max(highByte, lowByte)
// This is the only mapping that yields valid ranges for every observed
// palette in the BOOLHONG 5.50 char.dat (some entries store the higher
// index in the low byte). If a future hex dump proves a different
// convention, only this decoder needs to change.
export interface AnimationRange {
  start: number;
  end: number;
  length: number;
}

function decodeOffset(offset: number): AnimationRange | null {
  const hi = (offset >>> 8) & 0xff;
  const lo = offset & 0xff;
  const start = Math.min(hi, lo);
  const end = Math.max(hi, lo);
  const length = end - start + 1;
  if (length <= 1) return null;
  return { start, end, length };
}

export function getAnimationRanges(palette: PaletteVariant): AnimationRange[] {
  if (palette.animationColorCount === 0) return [];
  const ranges: AnimationRange[] = [];
  for (const offset of palette.animationOffsets) {
    const r = decodeOffset(offset);
    if (r) ranges.push(r);
  }
  return ranges;
}

export function hasColorAnimation(palette: PaletteVariant): boolean {
  return getAnimationRanges(palette).length > 0;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

// LCM of all animation range lengths. Bounded by `cap` to keep APNG frame
// count reasonable for ranges with long, coprime lengths.
export function colorAnimationPeriod(
  palette: PaletteVariant,
  cap = 32,
): number {
  const ranges = getAnimationRanges(palette);
  if (ranges.length === 0) return 1;
  let period = 1;
  for (const r of ranges) {
    period = lcm(period, r.length);
    if (period >= cap) return cap;
  }
  return period;
}

// Returns a new PaletteVariant whose colors are rotated by `tick` positions
// within each animation range. `tick=0` returns the original palette.
// Rotation direction: range[i] receives color from range[(i + tick) % length].
// When `reverse` is set the rotation runs the opposite way: the cycling
// animation baked into the original char.dat palettes reads backwards, so the
// renderer passes reverse=true for those (custom >=255 dyes keep the forward
// direction).
export function cyclePalette(
  palette: PaletteVariant,
  tick: number,
  reverse = false,
): PaletteVariant {
  const ranges = getAnimationRanges(palette);
  if (ranges.length === 0 || tick === 0) return palette;

  const out: Rgb[] = palette.colors.slice();
  for (const { start, end, length } of ranges) {
    const forwardRot = ((tick % length) + length) % length;
    const rot = reverse ? (length - forwardRot) % length : forwardRot;
    if (rot === 0) continue;
    const src = palette.colors.slice(start, end + 1);
    for (let i = 0; i < length; i++) {
      out[start + i] = src[(i + rot) % length];
    }
  }

  return {
    colors: out,
    animationColorCount: palette.animationColorCount,
    animationOffsets: palette.animationOffsets,
  };
}

// Returns LCM of color animation periods across every palette that the
// renderer will actually load for the given params. Bounded by `cap` so a
// single long-range palette doesn't blow up the APNG frame count.
//
// Mirrors palette resolution in renderer.ts. If you add or change a palette
// lookup there, update this too.
export function getRenderColorPeriod(params: RenderParams, cap = 32): number {
  const periods: number[] = [];
  const pushIf = (p: PaletteVariant | undefined) => {
    if (!p) return;
    const period = colorAnimationPeriod(p, cap);
    if (period > 1) periods.push(period);
  };

  const rowBody = TBL.body[params.body];
  if (rowBody) {
    const palBody =
      params.bodyc >= 255
        ? PAL.body[113 + params.bodyc / 255]
        : (PAL.body[rowBody._u2] ?? PAL.body[0]);
    pushIf(palBody);
  }

  const rowHead = TBL.head[params.head];
  if (rowHead) pushIf(PAL.head[rowHead._u2] ?? PAL.head[0]);

  if (params.shield >= 0) {
    const rowShld = TBL.shield[params.shield];
    if (rowShld) pushIf(PAL.shield[rowShld._u2] ?? PAL.shield[0]);
  }

  const w = params.weapon | 0;
  if (w >= 0 && w < 10000) {
    const r = TBL.sword[w];
    if (r) pushIf(PAL.sword[r._u2] ?? PAL.sword[0]);
  } else if (w >= 10000 && w < 20000) {
    const r = TBL.spear[w - 10000];
    if (r) pushIf(PAL.spear[r._u2] ?? PAL.spear[0]);
  } else if (w >= 30000 && w < 40000) {
    const r = TBL.fan[w - 30000];
    if (r) pushIf(PAL.fan[r._u2] ?? PAL.fan[0]);
  }

  let result = 1;
  for (const p of periods) {
    result = lcm(result, p);
    if (result >= cap) return cap;
  }
  return result;
}
