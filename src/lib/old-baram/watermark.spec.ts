import { stampWatermark } from './watermark';

/** 캐릭터 대신 쓰는 네모. 가운데에만 화소가 차 있고 둘레는 비어 있다. */
function surfaceWith(
  width: number,
  height: number,
  body: { left: number; top: number; right: number; bottom: number },
) {
  const rgba = new Uint8ClampedArray(width * height * 4);
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
    setPixel() {
      throw new Error('워터마크는 화소를 직접 물들여야 한다');
    },
  };
}

const BODY = { left: 30, top: 20, right: 89, bottom: 119 };

describe('stampWatermark', () => {
  /*
   * 그림 아래 띠로 붙이면 몇 줄만 잘라내면 원본이 그대로 남는다.
   * 글자가 그려진 화소 안에만 들어가야 잘라낼 수 없다.
   */
  it('never paints outside the character', () => {
    const surface = surfaceWith(120, 160, BODY);
    const before = Uint8ClampedArray.from(surface.rgba);

    stampWatermark(surface);

    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) {
        const offset = (y * surface.width + x) * 4;
        const inside =
          x >= BODY.left &&
          x <= BODY.right &&
          y >= BODY.top &&
          y <= BODY.bottom;
        if (inside) continue;
        expect(surface.rgba[offset + 3]).toBe(before[offset + 3]);
        expect(surface.rgba[offset]).toBe(before[offset]);
      }
    }
  });

  it('leaves every alpha value alone so the silhouette does not change', () => {
    const surface = surfaceWith(120, 160, BODY);
    const before = Uint8ClampedArray.from(surface.rgba);

    stampWatermark(surface);

    for (let offset = 3; offset < surface.rgba.length; offset += 4) {
      expect(surface.rgba[offset]).toBe(before[offset]);
    }
  });

  it('actually marks the character', () => {
    const surface = surfaceWith(120, 160, BODY);
    const before = Uint8ClampedArray.from(surface.rgba);

    stampWatermark(surface);

    let changed = 0;
    for (let offset = 0; offset < surface.rgba.length; offset += 4) {
      if (surface.rgba[offset] !== before[offset]) changed += 1;
    }
    expect(changed).toBeGreaterThan(20);
  });

  /*
   * 확대가 끝난 그림에 1픽셀 크기로 찍으면 확대율 1과 8 사이에서 글자가
   * 여덟 배 차이 난다. 몸통 폭을 따라가야 어느 확대율에서나 비슷하게 보인다.
   */
  it('keeps the mark the same share of the body at any scale', () => {
    const shareAt = (zoom: number) => {
      const body = {
        left: 30 * zoom,
        top: 20 * zoom,
        right: 30 * zoom + 60 * zoom - 1,
        bottom: 20 * zoom + 100 * zoom - 1,
      };
      const surface = surfaceWith(120 * zoom, 160 * zoom, body);
      stampWatermark(surface);

      // 몸통 안에서 색이 밀린 화소만 센다. 바깥은 원래 비어 있어 비교 대상이 아니다.
      let left = surface.width;
      let right = -1;
      for (let y = body.top; y <= body.bottom; y += 1) {
        for (let x = body.left; x <= body.right; x += 1) {
          if (surface.rgba[(y * surface.width + x) * 4] === 120) continue;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
      return (right - left + 1) / (60 * zoom);
    };

    const shares = [1, 2, 4, 8].map(shareAt);
    for (const share of shares) {
      expect(share).toBeGreaterThan(0.45);
      expect(share).toBeLessThanOrEqual(0.95);
    }
  });
});
