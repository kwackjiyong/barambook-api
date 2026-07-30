import type { PixelSurface } from './epf-image';

/**
 * 렌더 결과에 찍는 출처 표기.
 * 확대율과 무관하게 늘 같은 크기로 보이도록 확대가 끝난 이미지 위에 1픽셀 단위로 직접 찍는다.
 */
export const WATERMARK_TEXT = 'BARAMBOOK.COM';

const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
const GLYPH_GAP = 1;

/** 3x5 비트맵 글꼴. 도메인 표기에 필요한 글자만 가지고 있다. */
const GLYPHS: Record<string, string[]> = {
  A: ['111', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['111', '100', '100', '100', '111'],
  K: ['101', '101', '110', '101', '101'],
  M: ['101', '111', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'],
  '.': ['000', '000', '000', '000', '010'],
};

const INK: [number, number, number] = [25, 28, 25];
const HALO: [number, number, number] = [255, 253, 247];
const INK_ALPHA = 190;
const HALO_ALPHA = 120;

/** 글자 픽셀 폭. 오른쪽 정렬 위치를 잡을 때 쓴다. */
export const WATERMARK_WIDTH =
  WATERMARK_TEXT.length * GLYPH_WIDTH + (WATERMARK_TEXT.length - 1) * GLYPH_GAP;
export const WATERMARK_HEIGHT = GLYPH_HEIGHT;
/** 글자 둘레로 후광 1픽셀 + 여백 1픽셀 */
export const WATERMARK_PADDING = 2;
/** 글자가 잘리지 않으려면 이미지가 최소 이만큼은 넓어야 한다. */
export const WATERMARK_MIN_WIDTH = WATERMARK_WIDTH + WATERMARK_PADDING * 2;

function glyphPoints(x: number, y: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let cursor = x;

  for (const character of WATERMARK_TEXT) {
    const glyph = GLYPHS[character];
    if (glyph) {
      for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
        for (let column = 0; column < GLYPH_WIDTH; column += 1) {
          if (glyph[row][column] === '1') points.push([cursor + column, y + row]);
        }
      }
    }
    cursor += GLYPH_WIDTH + GLYPH_GAP;
  }

  return points;
}

/**
 * (x, y)를 글자 왼쪽 위로 삼아 워터마크를 찍는다.
 * 밝은 배경과 어두운 배경 어디에 올려도 읽히도록 먹색 글자 뒤에 종이색 후광을 깐다.
 */
export function drawWatermark(surface: PixelSurface, x: number, y: number): void {
  const points = glyphPoints(x, y);
  const filled = new Set(points.map(([px, py]) => `${px}:${py}`));
  const halo = new Set<string>();

  for (const [px, py] of points) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const key = `${px + dx}:${py + dy}`;
        // 후광이 겹쳐 찍히면 알파가 쌓여 번지므로 좌표마다 한 번만 찍는다.
        if (filled.has(key) || halo.has(key)) continue;
        halo.add(key);
      }
    }
  }

  for (const key of halo) {
    const [px, py] = key.split(':').map(Number);
    surface.setPixel(px, py, HALO[0], HALO[1], HALO[2], HALO_ALPHA);
  }
  for (const [px, py] of points) {
    surface.setPixel(px, py, INK[0], INK[1], INK[2], INK_ALPHA);
  }
}
