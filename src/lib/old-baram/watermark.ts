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

/** 글자가 몸통 폭에서 차지했으면 하는 비율 */
const TARGET_WIDTH_RATIO = 0.9;
/** 글자를 올릴 높이. 0이 정수리, 1이 발끝. 옷자락처럼 넓은 자리를 고른다. */
const VERTICAL_ANCHOR = 0.72;
/**
 * 밝은 화소는 이만큼 어둡게, 어두운 화소는 그 역수만큼 밝게.
 * 그림을 해치지 않는 쪽을 택한 값이라 눈에 잘 띄지 않는다.
 * 더 또렷하게 남기고 싶으면 낮추면 된다(0.40이면 확대율 4 이상에서 도메인이 읽힌다).
 */
const TINT_FACTOR = 0.7;
/** 어둡게 할지 밝게 할지 가르는 밝기 */
const LUMA_PIVOT = 96;

/**
 * 한 줄에서 화소가 끊기지 않고 이어지는 가장 긴 구간.
 *
 * 바운딩 박스 폭을 쓰면 무기·방패까지 들어가 실제 몸통보다 훨씬 넓게 잡히고,
 * 그 폭에 맞춰 글자를 키우면 대부분이 빈 곳에 떨어져 조각만 남는다.
 * 글자를 얹을 자리는 옷자락처럼 꽉 찬 구간이어야 한다.
 */
function widestRun(surface: StampTarget, row: number) {
  let best = { left: 0, width: 0 };
  let start = -1;

  for (let x = 0; x <= surface.width; x += 1) {
    const solid =
      x < surface.width && surface.rgba[(row * surface.width + x) * 4 + 3] > 0;
    if (solid) {
      if (start < 0) start = x;
      continue;
    }
    if (start >= 0) {
      if (x - start > best.width) best = { left: start, width: x - start };
      start = -1;
    }
  }

  return best;
}

/** 폭에 들어가는 가장 긴 표기. 좁을수록 짧게 줄인다. */
function textFor(width: number): string {
  if (watermarkWidthOf(WATERMARK_TEXT) <= width) return WATERMARK_TEXT;
  if (watermarkWidthOf(WATERMARK_SHORT_TEXT) <= width)
    return WATERMARK_SHORT_TEXT;
  return WATERMARK_MARK_TEXT;
}

/**
 * 화소 하나를 자기 색 기준으로 물들인다.
 *
 * 먹색 글자를 얹으면 그림 위에 붙인 스티커처럼 보인다. 대신 밑에 깔린 색을
 * 어둡게(어두운 색이면 밝게) 밀어서, 그림이 원래 가진 색조를 그대로 따라가게 한다.
 * 비어 있는 화소는 건드리지 않는다 - 그래야 글자가 캐릭터 안에만 남아 잘라낼 수 없다.
 */
function tintPixel(surface: StampTarget, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return;
  const offset = (y * surface.width + x) * 4;
  if (surface.rgba[offset + 3] === 0) return;

  const red = surface.rgba[offset];
  const green = surface.rgba[offset + 1];
  const blue = surface.rgba[offset + 2];
  const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
  const factor = luma > LUMA_PIVOT ? TINT_FACTOR : 1 / TINT_FACTOR;

  surface.rgba[offset] = red * factor;
  surface.rgba[offset + 1] = green * factor;
  surface.rgba[offset + 2] = blue * factor;
}

/**
 * 확대가 끝난 그림 위에 출처를 겹쳐 찍는다.
 *
 * 글자 크기를 캐릭터 크기에 맞춰 키운다. 확대율과 무관하게 1픽셀로 찍으면
 * 확대율 1과 8 사이에서 상대 크기가 여덟 배 벌어져, 어떤 때는 좁쌀만 하고
 * 어떤 때는 화면을 덮는다.
 *
 * 자리는 캔버스 바닥이 아니라 **그려진 화소** 기준으로 잡는다. 캔버스는 모든 자세를
 * 담느라 여백이 넓어서, 바닥에 맞추면 빈 곳에 놓여 아래 몇 줄만 잘라내면 그만이다.
 */
export function stampWatermark(surface: StampTarget): void {
  const painted = paintedBounds(surface);
  if (!painted) return;

  const paintedHeight = painted.bottom - painted.top + 1;
  const anchorRow = Math.round(painted.top + paintedHeight * VERTICAL_ANCHOR);
  const run = widestRun(surface, anchorRow);
  if (run.width === 0) return;

  const room = run.width * TARGET_WIDTH_RATIO;
  const text = textFor(room);
  const baseWidth = watermarkWidthOf(text);
  const scale = Math.max(1, Math.floor(room / baseWidth));

  const width = baseWidth * scale;
  const height = GLYPH_HEIGHT * scale;
  const left = Math.round(run.left + (run.width - width) / 2);
  const top = Math.round(anchorRow - height / 2);

  for (const [px, py] of glyphPoints(text, 0, 0)) {
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        tintPixel(surface, left + px * scale + dx, top + py * scale + dy);
      }
    }
  }
}
