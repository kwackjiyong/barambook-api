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

function map255toTri8(x: number) {
  const t = x % 15; // 0..15
  return t < 8 ? t : 15 - t; // 0..7..0
}
function map255toTri15(x: number) {
  const t = x % 31; // 0..15
  return t < 16 ? t : 31 - t; // 0..15..0
}
export function decodeWeaponEpfItem(
  item: EpfItem,
  palette: PaletteVariant,
  paletteCash: PaletteVariant,
  palleteNum: number,
  type: string,
  weaponNum: number = 0,
  rc: number = 0, // 고유색
  vc: number = 0, // 염색
  avc: number = -1, // 애니메이션 염색
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
          if (vc >= 255) {
            if (type === 'sword') {
              if (
                idx < 22 ||
                (![0, 6].includes(palleteNum) && // 6 횃불 - 32
                  [143, 32, 35, 36].includes(idx)) ||
                (palleteNum === 0 &&
                  weaponNum !== 62 && // 주작의검이 아닌 경우 62
                  [42, 43, 44, 45, 46, 47].includes(idx)) || // 47 철단도 46 극경
                (weaponNum === 18 &&
                  palleteNum === 0 &&
                  [115, 116, 117, 118, 119].includes(idx)) || // 깹방
                // p 0 - 81 염색
                // [20, 22, 25, 27].includes(idx) || // 이가닌자검에서 염색되어야 함
                ([14].includes(palleteNum) &&
                  [81, 82, 83, 84, 85].includes(idx)) || //협가검
                // (적염곤봉 59, 57)
                (palleteNum === 5 &&
                  [88, 89, 90, 91, 92, 93, 120].includes(idx)) || //태존도 손잡이 5팔레트
                ([6].includes(palleteNum) &&
                  [152, 153, 154, 155, 225, 226, 227, 228, 229].includes(
                    idx,
                  )) || //이가닌자의검
                ([6].includes(palleteNum) && // 횃불 151,
                  [145, 146, 147, 148, 149, 150, 151].includes(idx)) ||
                [18, 20, 21].includes(idx) || // 적호박별검
                (palleteNum === 11 &&
                  [112, 200, 201, 202, 203, 204, 205, 206, 207].includes(
                    idx,
                  )) || // 심판의낫
                (palleteNum === 14 && idx > 47 && idx < 64) || //카네이션
                (palleteNum === 14 && idx === 130) || //카네이션
                // 6 8 10 15 4개가 겹침;;
                ([6, 8, 10, 15].includes(palleteNum) &&
                  [89, 90, 91, 92, 93, 94].includes(idx)) || //검성기검 손자루
                (palleteNum === 16 &&
                  [126, 131].includes(weaponNum) &&
                  [89, 90, 91, 92, 93, 94, 95].includes(idx)) || // 현자금봉
                (palleteNum === 16 &&
                  [124, 129, 131].includes(weaponNum) &&
                  idx > 111 &&
                  idx < 120) || // 진선역봉 16팔레트에서만 적용되어야할 듯
                (palleteNum === 16 &&
                  [124, 125].includes(weaponNum) &&
                  idx > 87 &&
                  idx < 97) // 건곤권 삼첨도
              ) {
                realPalette = palette;
              } else {
                // 0...15로 매핑
                if (avc !== -1) {
                  ci = map255toTri15(map255toTri8(ci) + avc);
                } else {
                  ci = ci & 0x7;
                }
                realPalette = paletteCash;
              }
            } else if (type === 'fan') {
              if (
                ([1, 2].includes(palleteNum) &&
                  ![117, 116, 115, 114, 106, 107, 108].includes(idx) &&
                  idx > 55) || // 대모홍 107 108
                ([1, 2].includes(palleteNum) && [20, 22].includes(idx)) || // 대모홍접선 p2
                idx < 17 ||
                (palleteNum !== 0 && [143, 32, 35, 36].includes(idx)) || // 모르겠음 143은 흰색
                (weaponNum === 0 &&
                  palleteNum === 0 &&
                  [33, 34, 35, 36, 49, 50, 53].includes(idx)) || // 칠교 노리개 33~ 노랑, 49~ 초록
                (palleteNum === 0 && [59, 62].includes(idx)) // 인풍 노리개
              ) {
                realPalette = palette;
              } else {
                // 0...15로 매핑
                if (avc !== -1) {
                  ci = map255toTri15(map255toTri8(ci) + avc);
                } else {
                  ci = ci & 0x7;
                }
                realPalette = paletteCash;
              }
            } else if (type === 'spear') {
              if (
                (palleteNum !== 1 && idx > 135 && idx < 152) ||
                idx < 17 ||
                (idx > 31 && idx < 40) // 팔레트1 - 영롱비창
              ) {
                realPalette = palette;
              } else {
                // 0...15로 매핑
                if (avc !== -1) {
                  ci = map255toTri15(map255toTri8(ci) + avc);
                } else {
                  ci = ci & 0x7;
                }
                realPalette = paletteCash;
              }
            }
          }
          if (ci >= 48) {
            ci = (ci + (rc << 3)) & 0xff; // 255로 래핑
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

export function decodeBodyEpfItem(
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
