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
          // const vc5 = (vc | 0) & 0x1f; // vc 0..31로 마스킹 (8칸 * 32 = 256)
          let ci = idx;
          // 염색 가능 부위는 48 인덱스 부터 시작
          if (ci >= 48) {
            // 커스텀 추가 색상
            if (vc < 255) {
              ci = (ci + (vc << 3)) & 0xff; // ← 0..255로 래핑(mod 256)
            }
          }
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

export function decodeWeaponEpfItem(
  item: EpfItem,
  palette: PaletteVariant,
  paletteCash: PaletteVariant,
  type: string,
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
      // const len = b & 0x7F;
      // const draw = (b & 0x80) !== 0;
      const len = b & 127;
      const draw = (b & 128) !== 0;

      if (draw) {
        for (let k = 0; k < len && col + k < w; k++) {
          const pi = row * w + (col + k);
          const idx = pix[pi];
          // const vc5 = (vc | 0) & 0x1f; // vc 0..31로 마스킹 (8칸 * 32 = 256)
          let ci = idx;

          let realPalette = palette;
          // 염색 가능 부위는 48 인덱스 부터 시작
          if (vc >= 255) {
            if (type === 'sword') {
              if (
                idx < 22 ||
                [143, 32, 35, 36, 47].includes(idx) ||
                // [20, 22, 25, 27].includes(idx) || // 이가닌자검에서 염색되어야 함
                [81, 82, 83, 84, 85].includes(idx) || //협가검
                [48, 49, 50, 51, 52, 53, 54, 55, 58, 60, 61, 62, 63].includes(
                  idx,
                ) || //카네이션 (적염곤봉 59, 57)
                [152, 153, 154, 155, 225, 226, 227, 228, 229].includes(idx) || //이가닌자의검
                [18, 20, 21].includes(idx) || // 적호박별검
                [200, 201, 202, 203, 204, 205, 206, 207].includes(idx) || // 심판의낫
                [89, 90, 91, 92, 93, 94, 95].includes(idx) // 현자금봉
                // (idx > 111 && idx < 120) // 진선역봉 16팔레트에서만 적용되어야할 듯
              ) {
                realPalette = palette;
              } else {
                realPalette = paletteCash;
              }
            } else if (type === 'fan') {
              if (
                (![117, 116, 115, 114].includes(idx) && idx > 55) ||
                idx < 17 ||
                [143, 32, 35, 36].includes(idx)
              ) {
                realPalette = palette;
              } else {
                realPalette = paletteCash;
              }
            } else if (type === 'spear') {
              if (
                (idx > 135 && idx < 152) ||
                idx < 17 ||
                (idx > 31 && idx < 40)
              ) {
                realPalette = palette;
              } else {
                realPalette = paletteCash;
              }
            }
          }
          if (ci >= 48) {
            // 커스텀 추가 색상
            if (vc < 255) {
              ci = (ci + (vc << 3)) & 0xff; // ← 0..255로 래핑(mod 256)
            }
          }
          const c = realPalette[ci] ?? { r: 0, g: 0, b: 0 };
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
