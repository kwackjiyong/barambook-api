import { DecodedBitmap, EpfItem, PaletteVariant } from './types';

export function decodeEpfItem(
  item: EpfItem,
  palette: PaletteVariant,
  vc: number = 0,
  alpha: number = 255,
): DecodedBitmap {
  const w = (item.right - item.left) | 0;
  const h = (item.bottom - item.top) | 0;
  const rgba = new Uint8ClampedArray(w * h * 4);
  if (w <= 0 || h <= 0)
    return { w, h, left: item.left | 0, top: item.top | 0, rgba };

  const pix = Buffer.from(item.pixel, 'base64'); // full w*h index grid

  for (let row = 0; row < h; row++) {
    let col = 0;
    const mask = item.maskRows[row]
      ? Buffer.from(item.maskRows[row], 'base64')
      : Buffer.alloc(0);
    let rp = 0;
    while (rp < mask.length) {
      const b = mask[rp++];
      if (b === 0) break;
      // eslint-disable-next-line prettier/prettier
      // const len = b & 0x7F;
      // const draw = (b & 0x80) !== 0;
      const len = b & 127;
      const draw = (b & 128) !== 0;

      if (draw) {
        for (let k = 0; k < len && col + k < w; k++) {
          const pi = row * w + (col + k);
          const idx = pix[pi];
          let ci = idx;
          if (ci >= 48) ci = ci + vc * 8; // match .NET logic
          const c = palette[ci] ?? { r: 0, g: 0, b: 0 };
          const off = (row * w + (col + k)) * 4;
          rgba[off] = c.r;
          rgba[off + 1] = c.g;
          rgba[off + 2] = c.b;
          rgba[off + 3] = alpha | 0;
        }
      }
      col += len;
      if (col >= w) break;
    }
  }

  return { w, h, left: item.left | 0, top: item.top | 0, rgba };
}
