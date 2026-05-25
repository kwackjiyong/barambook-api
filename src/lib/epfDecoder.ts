import { DecodedBitmap, EpfItem, PaletteVariant } from './types';
import {
  applyWeaponDyeExceptionDecision,
  WeaponDyeWeaponType,
} from './weaponDyeExceptions';

function createEmptyBitmap(item: EpfItem, w: number, h: number): DecodedBitmap {
  return {
    w,
    h,
    left: item.left | 0,
    top: item.top | 0,
    rgba: new Uint8ClampedArray(w * h * 4),
  };
}

export function decodeEpfItem(
  item: EpfItem,
  palette: PaletteVariant,
  vc = 0,
  alpha = 255,
): DecodedBitmap {
  const w = (item.right - item.left) | 0;
  const h = (item.bottom - item.top) | 0;
  const bitmap = createEmptyBitmap(item, w, h);

  if (w <= 0 || h <= 0) {
    return bitmap;
  }

  const pix = Buffer.from(item.pixel, 'base64');

  for (let row = 0; row < h; row += 1) {
    let col = 0;
    const mask = item.maskRows[row]
      ? Buffer.from(item.maskRows[row], 'base64')
      : Buffer.alloc(0);
    let rp = 0;

    while (rp < mask.length) {
      const b = mask[rp++];
      if (b === 0) {
        break;
      }

      const len = b & 127;
      const draw = (b & 128) !== 0;

      if (draw) {
        for (let k = 0; k < len && col + k < w; k += 1) {
          const pi = row * w + (col + k);
          let ci = pix[pi];

          if (ci >= 48 && vc < 255) {
            ci = (ci + (vc << 3)) & 0xff;
          }

          const c = palette.colors[ci] ?? { r: 0, g: 0, b: 0 };
          const off = (row * w + (col + k)) * 4;
          bitmap.rgba[off] = c.r;
          bitmap.rgba[off + 1] = c.g;
          bitmap.rgba[off + 2] = c.b;
          bitmap.rgba[off + 3] = alpha | 0;
        }
      }

      col += len;
      if (col >= w) {
        break;
      }
    }
  }

  return bitmap;
}

function map255toTri8(x: number) {
  const t = x % 15;
  return t < 8 ? t : 15 - t;
}

function map255toTri15(x: number) {
  const t = x % 31;
  return t < 16 ? t : 31 - t;
}

function shouldUseOriginalWeaponPalette(
  type: WeaponDyeWeaponType,
  palleteNum: number,
  weaponNum: number,
  idx: number,
) {
  if (type === 'sword') {
    return (
      (weaponNum !== 151 && idx < 22) ||
      (![0, 6].includes(palleteNum) && [143, 32, 35, 36].includes(idx)) ||
      (palleteNum === 0 &&
        weaponNum !== 62 &&
        [42, 43, 44, 45, 46, 47].includes(idx)) ||
      (weaponNum === 18 &&
        palleteNum === 0 &&
        [115, 116, 117, 118, 119].includes(idx)) ||
      ([14].includes(palleteNum) && [81, 82, 83, 84, 85].includes(idx)) ||
      (palleteNum === 5 && [88, 89, 90, 91, 92, 93, 120].includes(idx)) ||
      ([6].includes(palleteNum) &&
        [152, 153, 154, 155, 225, 226, 227, 228, 229].includes(idx)) ||
      ([6].includes(palleteNum) &&
        [145, 146, 147, 148, 149, 150, 151].includes(idx)) ||
      [18, 20, 21].includes(idx) ||
      (palleteNum === 11 &&
        [112, 200, 201, 202, 203, 204, 205, 206, 207].includes(idx)) ||
      (palleteNum === 14 && idx > 47 && idx < 64) ||
      (palleteNum === 14 && idx === 130) ||
      ([6, 8, 10, 15].includes(palleteNum) &&
        [89, 90, 91, 92, 93, 94].includes(idx)) ||
      (palleteNum === 16 &&
        [126, 131].includes(weaponNum) &&
        [89, 90, 91, 92, 93, 94, 95].includes(idx)) ||
      (palleteNum === 16 &&
        [124, 129, 131].includes(weaponNum) &&
        idx > 111 &&
        idx < 120) ||
      (palleteNum === 16 &&
        [124, 125].includes(weaponNum) &&
        idx > 87 &&
        idx < 97)
    );
  }

  if (type === 'fan') {
    return (
      ([1, 2].includes(palleteNum) &&
        ![117, 116, 115, 114, 106, 107, 108].includes(idx) &&
        idx > 55) ||
      ([1, 2].includes(palleteNum) && [20, 22].includes(idx)) ||
      idx < 17 ||
      (palleteNum !== 0 && [143, 32, 35, 36].includes(idx)) ||
      (weaponNum === 0 &&
        palleteNum === 0 &&
        [33, 34, 35, 36, 49, 50, 53].includes(idx)) ||
      (palleteNum === 0 && [59, 62].includes(idx))
    );
  }

  return (
    (palleteNum !== 1 && idx > 135 && idx < 152) ||
    idx < 17 ||
    (idx > 31 && idx < 40)
  );
}

export function decodeWeaponEpfItem(
  item: EpfItem,
  palette: PaletteVariant,
  paletteCash: PaletteVariant,
  palleteNum: number,
  type: WeaponDyeWeaponType,
  weaponNum = 0,
  rc = 0,
  vc = 0,
  avc = -1,
  alpha = 255,
): DecodedBitmap {
  const w = (item.right - item.left) | 0;
  const h = (item.bottom - item.top) | 0;
  const bitmap = createEmptyBitmap(item, w, h);

  if (w <= 0 || h <= 0) {
    return bitmap;
  }

  const pix = Buffer.from(item.pixel, 'base64');

  for (let row = 0; row < h; row += 1) {
    let col = 0;
    const mask = item.maskRows[row]
      ? Buffer.from(item.maskRows[row], 'base64')
      : Buffer.alloc(0);
    let rp = 0;

    while (rp < mask.length) {
      const b = mask[rp++];
      if (b === 0) {
        break;
      }

      const len = b & 127;
      const draw = (b & 128) !== 0;

      if (draw) {
        for (let k = 0; k < len && col + k < w; k += 1) {
          const pi = row * w + (col + k);
          const idx = pix[pi];
          let ci = idx;
          let realPalette = palette;

          if (vc >= 255) {
            const useOriginalPalette = applyWeaponDyeExceptionDecision(
              shouldUseOriginalWeaponPalette(type, palleteNum, weaponNum, idx),
              type,
              weaponNum,
              palleteNum,
              idx,
              row,
            );

            if (!useOriginalPalette) {
              ci =
                avc !== -1 ? map255toTri15(map255toTri8(ci) + avc) : ci & 0x7;
              realPalette = paletteCash;
            }
          }

          if (ci >= 48) {
            ci = (ci + (rc << 3)) & 0xff;
          }

          const c = realPalette.colors[ci] ?? { r: 0, g: 0, b: 0 };
          const off = (row * w + (col + k)) * 4;
          bitmap.rgba[off] = c.r;
          bitmap.rgba[off + 1] = c.g;
          bitmap.rgba[off + 2] = c.b;
          bitmap.rgba[off + 3] = alpha | 0;
        }
      }

      col += len;
      if (col >= w) {
        break;
      }
    }
  }

  return bitmap;
}

export function decodeBodyEpfItem(
  item: EpfItem,
  palette: PaletteVariant,
  bodyNum = 0,
  vc = 0,
  alpha = 255,
): DecodedBitmap {
  const w = (item.right - item.left) | 0;
  const h = (item.bottom - item.top) | 0;
  const bitmap = createEmptyBitmap(item, w, h);

  if (w <= 0 || h <= 0) {
    return bitmap;
  }

  const pix = Buffer.from(item.pixel, 'base64');

  for (let row = 0; row < h; row += 1) {
    let col = 0;
    const mask = item.maskRows[row]
      ? Buffer.from(item.maskRows[row], 'base64')
      : Buffer.alloc(0);
    let rp = 0;

    while (rp < mask.length) {
      const b = mask[rp++];
      if (b === 0) {
        break;
      }

      const len = b & 127;
      const draw = (b & 128) !== 0;

      if (draw) {
        for (let k = 0; k < len && col + k < w; k += 1) {
          const pi = row * w + (col + k);
          const idx = pix[pi];
          let ci = idx;

          if (
            ([17].includes(bodyNum) &&
              ![
                31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16,
              ].includes(idx)) ||
            ([126, 127].includes(bodyNum) &&
              ![
                37, 36, 34, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20,
                19, 18, 17, 16,
              ].includes(idx)) ||
            ([115, 116].includes(bodyNum) &&
              ![
                37, 36, 34, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20,
                19, 18, 17, 16,
              ].includes(idx)) ||
            ([70].includes(bodyNum) &&
              ![
                81, 82, 81, 80, 37, 36, 34, 32, 31, 30, 29, 28, 27, 26, 25, 24,
                23, 22, 21, 20, 19, 18, 17, 16,
              ].includes(idx))
          ) {
            const ti = ci + (vc >= 255 ? 48 : 0);
            ci = (ti + (vc << 3)) & 0xff;
          } else if (ci >= 48 && vc < 255) {
            ci = (ci + (vc << 3)) & 0xff;
          }

          const c = palette.colors[ci] ?? { r: 0, g: 0, b: 0 };
          const off = (row * w + (col + k)) * 4;
          bitmap.rgba[off] = c.r;
          bitmap.rgba[off + 1] = c.g;
          bitmap.rgba[off + 2] = c.b;
          bitmap.rgba[off + 3] = alpha | 0;
        }
      }

      col += len;
      if (col >= w) {
        break;
      }
    }
  }

  return bitmap;
}
