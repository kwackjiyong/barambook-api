import { stampWatermark } from './watermark';

/** 캐릭터 대신 쓰는 네모. 가운데에만 화소가 차 있고 둘레는 비어 있다. */
function surfaceWith(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const body = {
    left: Math.round(width * 0.35),
    right: Math.round(width * 0.65),
    top: Math.round(height * 0.1),
    bottom: Math.round(height * 0.75),
  };

  for (let y = body.top; y <= body.bottom; y += 1) {
    for (let x = body.left; x <= body.right; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 120;
      rgba[offset + 1] = 160;
      rgba[offset + 2] = 120;
      rgba[offset + 3] = 255;
    }
  }

  return {
    width,
    height,
    rgba,
    body,
    setPixel() {
      throw new Error('워터마크는 화소를 직접 칠해야 한다');
    },
  };
}

/** 워터마크가 건드린 화소를 모아 본다. */
function stampAndDiff(width: number, height: number) {
  const surface = surfaceWith(width, height);
  const before = Uint8ClampedArray.from(surface.rgba);
  stampWatermark(surface);

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  let onCharacter = 0;
  let onEmpty = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const changed =
        surface.rgba[offset] !== before[offset] ||
        surface.rgba[offset + 3] !== before[offset + 3];
      if (!changed) continue;

      if (before[offset + 3] === 0) onEmpty += 1;
      else onCharacter += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  return { surface, before, left, right, top, bottom, onCharacter, onEmpty };
}

describe('stampWatermark', () => {
  it('marks the image', () => {
    const mark = stampAndDiff(200, 260);
    expect(mark.right).toBeGreaterThan(mark.left);
    expect(mark.bottom).toBeGreaterThan(mark.top);
  });

  /*
   * 확대가 끝난 그림에 1픽셀 크기로 찍거나 정수 배율로만 키우면 확대율이 바뀔 때마다
   * 글자 크기가 튄다. 그림 폭의 일정 비율이어야 어느 확대율에서나 같아 보인다.
   */
  it('keeps the mark the same share of the image at every scale', () => {
    const shares = [80, 160, 240, 320].map((width) => {
      const mark = stampAndDiff(width, Math.round(width * 1.3));
      return (mark.right - mark.left + 1) / width;
    });

    for (const share of shares) {
      expect(share).toBeGreaterThan(0.7);
      expect(share).toBeLessThan(0.95);
    }
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(0.08);
  });

  /*
   * 캐릭터를 비켜 여백에만 찍으면 캐릭터 경계에 맞춰 잘라내는 것만으로 표시가 날아간다.
   * 글자가 캐릭터를 가로질러야 한다.
   */
  it('crosses the character so it cannot be cropped away', () => {
    const mark = stampAndDiff(200, 260);
    expect(mark.onCharacter).toBeGreaterThan(20);
  });

  /*
   * 캐릭터 뒤에 깐 글자는 빈 여백에만 남는다. 무대 바탕색 그대로라 화면에서는 묻히고,
   * 내려받아 다른 바탕에 올리면 진하게 드러난다.
   */
  it('lays a solid stage-coloured line behind the character', () => {
    const mark = stampAndDiff(200, 260);
    expect(mark.onEmpty).toBeGreaterThan(20);

    for (let offset = 0; offset < mark.surface.rgba.length; offset += 4) {
      if (mark.before[offset + 3] !== 0) continue;
      if (mark.surface.rgba[offset + 3] === 0) continue;
      expect([
        mark.surface.rgba[offset],
        mark.surface.rgba[offset + 1],
        mark.surface.rgba[offset + 2],
        mark.surface.rgba[offset + 3],
      ]).toEqual([0xef, 0xe8, 0xd9, 255]);
    }
  });

  /* 한 줄만 있으면 그 줄만 지워도 표시가 사라진다. */
  it('repeats down the character instead of marking one line', () => {
    const mark = stampAndDiff(200, 260);
    const rows = new Set<number>();

    for (let y = 0; y < 260; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const offset = (y * 200 + x) * 4;
        if (mark.surface.rgba[offset] !== mark.before[offset]) {
          rows.add(y);
          break;
        }
      }
    }

    // 글자가 놓인 줄들 사이에 빈 줄이 있어야 여러 줄로 나뉜 것이다.
    const sorted = [...rows].sort((left, right) => left - right);
    const breaks = sorted.filter(
      (row, index) => index > 0 && row - sorted[index - 1] > 1,
    );
    expect(breaks.length).toBeGreaterThanOrEqual(3);
  });
});
