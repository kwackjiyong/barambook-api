import { DecodedBitmap } from './types';

/**
 * Simple painter's algorithm compositor: draws bitmaps in order onto a single RGBA canvas.
 * No blending (all source pixels are fully opaque); background stays transparent.
 */
export function composite(
  bitmaps: DecodedBitmap[],
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const anchorX = (width / 2) | 0;
  const anchorY = (height / 2) | 0;

  for (const bmp of bitmaps) {
    const dstX = anchorX + bmp.left;
    const dstY = anchorY + bmp.top;
    for (let y = 0; y < bmp.h; y++) {
      const dy = dstY + y;
      if (dy < 0 || dy >= height) continue;
      for (let x = 0; x < bmp.w; x++) {
        const dx = dstX + x;
        if (dx < 0 || dx >= width) continue;
        const sOff = (y * bmp.w + x) * 4;
        const a = bmp.rgba[sOff + 3];
        if (a === 0) continue;
        const dOff = (dy * width + dx) * 4;
        out[dOff] = bmp.rgba[sOff];
        out[dOff + 1] = bmp.rgba[sOff + 1];
        out[dOff + 2] = bmp.rgba[sOff + 2];
        out[dOff + 3] = 255;
      }
    }
  }

  return out;
}
