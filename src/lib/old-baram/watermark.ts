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
/** 전체 표기가 안 들어가는 좁은 그림에 쓰는 짧은 표기 */
export const WATERMARK_SHORT_TEXT = 'BB.COM';
/** 그마저 안 들어가는 아주 작은 그림에 쓰는 표기 */
export const WATERMARK_MARK_TEXT = 'BB';

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

/** 글자가 그림 폭에서 차지하는 비율. 확대율이 바뀌어도 이 비율은 그대로다. */
const TARGET_WIDTH_RATIO = 0.62;
/** 글자 아래를 그림 바닥에서 얼마나 띄울지(글자 높이 대비) */
const BOTTOM_MARGIN_RATIO = 0.4;

const INK: [number, number, number] = [24, 26, 24];
const HALO: [number, number, number] = [255, 252, 244];
/** 진하기. 낮출수록 그림에 묻힌다. */
const INK_ALPHA = 165;
const HALO_ALPHA = 115;

function paint(
  surface: StampTarget,
  x: number,
  y: number,
  color: [number, number, number],
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return;
  const offset = (y * surface.width + x) * 4;
  const source = alpha / 255;
  const behind = (surface.rgba[offset + 3] / 255) * (1 - source);
  const total = source + behind;
  if (total <= 0) return;

  for (let channel = 0; channel < 3; channel += 1) {
    surface.rgba[offset + channel] =
      (color[channel] * source + surface.rgba[offset + channel] * behind) /
      total;
  }
  surface.rgba[offset + 3] = total * 255;
}

/**
 * 확대가 끝난 그림 아래쪽에 출처를 찍는다.
 *
 * 글자 크기는 **그림 폭의 일정 비율**로 잡는다. 확대율과 무관하게 1픽셀로 찍거나
 * 정수 배율로만 키우면 확대율이 바뀔 때마다 크기가 튀어, 어떤 때는 좁쌀만 하고
 * 어떤 때는 유난히 크다. 배율을 소수로 두고 글자 칸을 사각형으로 채워
 * 어느 확대율에서나 같은 비율로 보이게 한다.
 *
 * 자리는 캔버스 바닥이 아니라 **그려진 화소**의 바닥에 맞춘다. 캔버스는 모든 자세를
 * 담느라 여백이 넓어서, 바닥에 맞추면 캐릭터에서 한참 떨어진 빈 곳에 놓인다.
 */
export function stampWatermark(surface: StampTarget): void {
  const painted = paintedBounds(surface);
  if (!painted) return;

  /*
   * 글자 칸이 1픽셀보다 작아지면 획이 통째로 사라져 뭉갠 자국만 남는다.
   * 그럴 만큼 좁은 그림(부위 목록 썸네일 등)에서는 표기를 줄여 읽히게 둔다.
   */
  const room = surface.width * TARGET_WIDTH_RATIO;
  const text =
    [WATERMARK_TEXT, WATERMARK_SHORT_TEXT, WATERMARK_MARK_TEXT].find(
      (candidate) => watermarkWidthOf(candidate) <= room,
    ) ?? WATERMARK_MARK_TEXT;
  const baseWidth = watermarkWidthOf(text);

  const scale = room / baseWidth;
  const height = GLYPH_HEIGHT * scale;
  const left = (surface.width - baseWidth * scale) / 2;
  const top = Math.min(
    painted.bottom - height * BOTTOM_MARGIN_RATIO,
    surface.height - height,
  );

  // 글자 칸 하나를 사각형으로 채운다. 소수 배율에서도 틈이 생기지 않는다.
  const cells: Array<[number, number, number, number]> = [];
  for (const [px, py] of glyphPoints(text, 0, 0)) {
    const x0 = Math.round(left + px * scale);
    const x1 = Math.round(left + (px + 1) * scale);
    const y0 = Math.round(top + py * scale);
    const y1 = Math.round(top + (py + 1) * scale);
    cells.push([x0, y0, x1, y1]);
  }

  const filled = new Set<string>();
  for (const [x0, y0, x1, y1] of cells) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) filled.add(`${x}:${y}`);
    }
  }

  // 밝은 배경과 어두운 배경 어디에 올려도 읽히도록 글자 뒤에 후광을 깐다.
  const halo = new Set<string>();
  for (const key of filled) {
    const [x, y] = key.split(':').map(Number);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const around = `${x + dx}:${y + dy}`;
        if (!filled.has(around)) halo.add(around);
      }
    }
  }

  for (const key of halo) {
    const [x, y] = key.split(':').map(Number);
    paint(surface, x, y, HALO, HALO_ALPHA);
  }
  for (const key of filled) {
    const [x, y] = key.split(':').map(Number);
    paint(surface, x, y, INK, INK_ALPHA);
  }
}
