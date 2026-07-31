import type { PixelSurface } from './epf-image';

/**
 * 렌더 결과에 찍는 출처 표기.
 * 확대율과 무관하게 늘 같은 크기로 보이도록 확대가 끝난 이미지 위에 1픽셀 단위로 직접 찍는다.
 *
 * 그림 아래에 띠를 덧붙이는 방식은 아래 몇 줄만 잘라내면 원본이 그대로 남아
 * 자동 수집에는 아무 소용이 없다. 그래서 그림 **안쪽**, 캐릭터가 서 있는 자리에 겹쳐 찍는다.
 * 잘라내려면 캐릭터 발밑을 같이 잘라내야 한다.
 */
export const WATERMARK_TEXT = 'BARAMBOOK.COM';
/** 글자가 다 안 들어가는 작은 그림에 쓰는 짧은 표기 */
export const WATERMARK_SHORT_TEXT = 'BB.COM';

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

/** 글자 픽셀 폭 */
export function watermarkWidthOf(text: string): number {
  return text.length * GLYPH_WIDTH + (text.length - 1) * GLYPH_GAP;
}

export const WATERMARK_WIDTH = watermarkWidthOf(WATERMARK_TEXT);
export const WATERMARK_HEIGHT = GLYPH_HEIGHT;
/** 글자 둘레로 후광 1픽셀 + 여백 1픽셀 */
export const WATERMARK_PADDING = 2;

function glyphPoints(
  text: string,
  x: number,
  y: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let cursor = x;

  for (const character of text) {
    const glyph = GLYPHS[character];
    if (glyph) {
      for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
        for (let column = 0; column < GLYPH_WIDTH; column += 1) {
          if (glyph[row][column] === '1')
            points.push([cursor + column, y + row]);
        }
      }
    }
    cursor += GLYPH_WIDTH + GLYPH_GAP;
  }

  return points;
}

interface StampTarget extends PixelSurface {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

/** 실제로 그려진 화소만 감싸는 사각형. 캔버스에는 늘 빈 여백이 있어 이걸 따로 잰다. */
function paintedBounds(surface: StampTarget) {
  let left = surface.width;
  let top = surface.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      if (surface.rgba[(y * surface.width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0) return null;
  return { left, top, right, bottom };
}

/**
 * 확대가 끝난 그림 위에 출처를 겹쳐 찍는다.
 *
 * 캔버스 바닥이 아니라 **그려진 화소의 아래쪽**에 맞춘다.
 * 캔버스는 모든 자세를 담느라 여백이 넓어서, 바닥에 찍으면 빈 곳에 놓여
 * 아래 몇 줄만 잘라내면 그만이다. 캐릭터 몸 위로 지나가야 잘라낼 수 없다.
 * 폭이 좁아 전체 표기가 안 들어가면 짧은 표기로 줄인다.
 */
export function stampWatermark(surface: StampTarget): void {
  const painted = paintedBounds(surface);
  if (!painted) return;

  const text =
    WATERMARK_WIDTH + WATERMARK_PADDING * 2 <= surface.width
      ? WATERMARK_TEXT
      : WATERMARK_SHORT_TEXT;
  const width = watermarkWidthOf(text);

  // 가로는 캐릭터 가운데, 세로는 발치보다 살짝 위로 올려 몸에 걸친다.
  const centerX = (painted.left + painted.right) / 2;
  const x = Math.round(
    Math.min(Math.max(centerX - width / 2, 0), surface.width - width),
  );
  const y = Math.max(
    painted.top,
    Math.min(painted.bottom - GLYPH_HEIGHT, surface.height - GLYPH_HEIGHT - 1),
  );

  drawWatermarkText(surface, x, y, text);
}

/**
 * (x, y)를 글자 왼쪽 위로 삼아 워터마크를 찍는다.
 * 밝은 배경과 어두운 배경 어디에 올려도 읽히도록 먹색 글자 뒤에 종이색 후광을 깐다.
 */
export function drawWatermarkText(
  surface: PixelSurface,
  x: number,
  y: number,
  text: string = WATERMARK_TEXT,
): void {
  const points = glyphPoints(text, x, y);
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
