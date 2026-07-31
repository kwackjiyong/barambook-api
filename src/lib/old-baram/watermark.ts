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

/**
 * 의상실이 캐릭터를 올려 두는 바탕색(`#efe8d9`).
 *
 * 이 색으로 **빈 여백에만** 찍으면 화면에서는 바탕에 묻혀 보이지 않고,
 * 저장해서 다른 바탕에 올리는 순간 드러난다.
 * 프론트에서 무대·부위 썸네일·목록 타일이 모두 같은 색을 쓰므로 한 값이면 된다.
 * (`src/app/old-render/components/OldDressRoom.module.css`)
 */
const STAGE_BACKGROUND: [number, number, number] = [0xef, 0xe8, 0xd9];

/** 캐릭터 위에 겹친 부분의 진하기. 1에 가까울수록 연하다. */
const TINT_FACTOR = 0.82;
/** 어둡게 밀지 밝게 밀지 가르는 밝기 */
const LUMA_PIVOT = 96;

/**
 * 글자 한 화소를 찍는다. 밑에 무엇이 깔렸는지에 따라 두 갈래로 나뉜다.
 *
 * - **빈 여백**: 무대 바탕색으로 채운다. 의상실에서는 바탕에 묻혀 안 보이고,
 *   내려받아 다른 바탕에 올리면 드러난다.
 * - **캐릭터 위**: 밑색을 살짝 밀어 물들인다. 바탕색으로 덮으면 화면에서 그대로 보인다.
 *   그렇다고 캐릭터를 비켜 가면 아래 여백만 잘라내도 표시가 사라져,
 *   겹쳐 찍는 원래 목적이 없어진다.
 */
function markPixel(surface: StampTarget, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) return;
  const offset = (y * surface.width + x) * 4;

  if (surface.rgba[offset + 3] === 0) {
    surface.rgba[offset] = STAGE_BACKGROUND[0];
    surface.rgba[offset + 1] = STAGE_BACKGROUND[1];
    surface.rgba[offset + 2] = STAGE_BACKGROUND[2];
    surface.rgba[offset + 3] = 255;
    return;
  }

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
 * 캐릭터 아래쪽에 걸쳐 출처를 찍는다.
 *
 * 의상실 화면에서는 거의 드러나지 않고 내려받아 다른 바탕에 올리면 보인다.
 * 빈 여백은 무대 바탕색으로 채워 화면에서 묻히게 하고, 캐릭터와 겹치는 부분만
 * 밑색을 살짝 밀어 물들인다. 캐릭터를 아예 비켜 가면 아래 몇 줄만 잘라내도
 * 표시가 사라져, 겹쳐 찍는 원래 목적이 없어진다.
 *
 * 글자 크기는 **그림 폭의 일정 비율**로 잡는다. 확대율과 무관하게 1픽셀로 찍거나
 * 정수 배율로만 키우면 확대율이 바뀔 때마다 크기가 튀어, 어떤 때는 좁쌀만 하고
 * 어떤 때는 유난히 크다. 배율을 소수로 두고 글자 칸을 사각형으로 채워
 * 어느 확대율에서나 같은 비율로 보이게 한다.
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
  // 캐릭터 아래쪽에 걸치게 둔다. 여백으로 내리면 그 줄만 잘라내도 표시가 사라진다.
  const top = painted.bottom - height + 1;

  // 글자 칸 하나를 사각형으로 채운다. 소수 배율에서도 틈이 생기지 않는다.
  const cells: Array<[number, number, number, number]> = [];
  for (const [px, py] of glyphPoints(text, 0, 0)) {
    const x0 = Math.round(left + px * scale);
    const x1 = Math.round(left + (px + 1) * scale);
    const y0 = Math.round(top + py * scale);
    const y1 = Math.round(top + (py + 1) * scale);
    cells.push([x0, y0, x1, y1]);
  }

  for (const [x0, y0, x1, y1] of cells) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) markPixel(surface, x, y);
    }
  }
}
