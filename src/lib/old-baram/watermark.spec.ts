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

/** 워터마크가 건드린 화소의 범위 */
function markBounds(width: number, height: number) {
  const surface = surfaceWith(width, height);
  const before = Uint8ClampedArray.from(surface.rgba);
  stampWatermark(surface);

  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const same =
        surface.rgba[offset] === before[offset] &&
        surface.rgba[offset + 3] === before[offset + 3];
      if (same) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  return { left, right, top, bottom, body: surface.body };
}

describe('stampWatermark', () => {
  it('marks the image', () => {
    const mark = markBounds(200, 260);
    expect(mark.right).toBeGreaterThan(mark.left);
    expect(mark.bottom).toBeGreaterThan(mark.top);
  });

  /*
   * 확대가 끝난 그림에 1픽셀 크기로 찍거나 정수 배율로만 키우면 확대율이 바뀔 때마다
   * 글자 크기가 튄다. 그림 폭의 일정 비율이어야 어느 확대율에서나 같아 보인다.
   */
  it('keeps the mark the same share of the image at every scale', () => {
    const shares = [80, 160, 240, 320].map((width) => {
      const mark = markBounds(width, Math.round(width * 1.3));
      return (mark.right - mark.left + 1) / width;
    });

    for (const share of shares) {
      expect(share).toBeGreaterThan(0.55);
      expect(share).toBeLessThan(0.75);
    }
    // 확대율이 달라져도 서로 거의 같아야 한다.
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(0.08);
  });

  /*
   * 화면에서는 무대 바탕에 묻히고 내려받으면 드러나야 한다.
   * 빈 여백은 바탕색으로 채우고, 캐릭터와 겹치는 자리는 밑색을 살짝 미는 것으로 끝낸다.
   * 캐릭터를 아예 비켜 가면 아래 몇 줄만 잘라내도 표시가 사라진다.
   */
  it('fills empty space with the stage colour and only tints the character', () => {
    const surface = surfaceWith(200, 260);
    const before = Uint8ClampedArray.from(surface.rgba);
    stampWatermark(surface);

    let filledEmpty = 0;
    let tintedBody = 0;

    for (let offset = 0; offset < surface.rgba.length; offset += 4) {
      const wasEmpty = before[offset + 3] === 0;
      const changed =
        surface.rgba[offset] !== before[offset] ||
        surface.rgba[offset + 3] !== before[offset + 3];
      if (!changed) continue;

      if (wasEmpty) {
        expect([
          surface.rgba[offset],
          surface.rgba[offset + 1],
          surface.rgba[offset + 2],
          surface.rgba[offset + 3],
        ]).toEqual([0xef, 0xe8, 0xd9, 255]);
        filledEmpty += 1;
      } else {
        // 캐릭터 위에서는 불투명도를 건드리지 않는다. 실루엣이 바뀌면 안 된다.
        expect(surface.rgba[offset + 3]).toBe(before[offset + 3]);
        tintedBody += 1;
      }
    }

    expect(filledEmpty).toBeGreaterThan(0);
    expect(tintedBody).toBeGreaterThan(0);
  });

  it('sits at the bottom, near the feet rather than the empty canvas floor', () => {
    const mark = markBounds(200, 260);
    const middle = (mark.body.top + mark.body.bottom) / 2;

    expect(mark.top).toBeGreaterThan(middle);
    // 캔버스 바닥이 아니라 그려진 화소 바닥에 붙는다.
    expect(mark.bottom).toBeLessThan(260 - 1);
  });
});
