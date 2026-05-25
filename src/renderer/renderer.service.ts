import { Injectable } from '@nestjs/common';
import { renderToPng } from '../lib/renderer';
import { getRenderColorPeriod } from '../lib/paletteAnimation';
import { RenderParams } from '../lib/types';
import { makeAPNGBase64 } from '../lib/apngEncoder';

const ACTION_FRAMES_3PNG = [
  0, 3, 6, 9, 12, 15, 18, 21, 32, 35, 38, 41, 52, 55, 58, 61, 80, 83, 86, 89,
];
const ACTION_FRAMES_2PNG = [25, 27, 29, 31, 45, 47, 49, 51];
const ACTION_FRAMES_KITE = [115, 116, 117, 118];

// Color cycling holds each tick for N output frames. Higher = slower color
// transition. Frame-based weapon/action animations stay at their original
// speed because they advance once per output frame regardless.
const COLOR_TICK_HOLD = 3;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}
function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

@Injectable()
export class RendererService {
  async render(params: RenderParams) {
    const buffers = await this.pngRender(params);
    if (buffers.length === 1) {
      return buffers[0];
    }
    return makeAPNGBase64(
      buffers.map((b) => ({ png: b, delayNum: 3.3 })),
      { loopCount: 0 },
    );
  }

  async pngRender(params: RenderParams): Promise<Buffer[]> {
    // 무기 염색 애니메이션 계열인 경우 (weaponc = 255/510/765)
    // 총 프레임 = 32 * COLOR_TICK_HOLD. 색상 관련(weaponAnic, colorTick)은
    // tick = floor(x / HOLD) 으로 묶어서 HOLD 프레임마다 한 번 진행되고,
    // 액션 프레임 선택(x % 2, x % 4) 은 그대로 x 를 써서 원속도 유지.
    if ([255, 510, 765].includes(params.weaponc)) {
      const dyeLen = 32 * COLOR_TICK_HOLD;
      if (params.isAction) {
        if (ACTION_FRAMES_3PNG.includes(params.frame)) {
          return Promise.all(
            Array.from({ length: dyeLen }, (_, i) => i)
              .reverse()
              .map((x) => {
                const tick = Math.floor(x / COLOR_TICK_HOLD);
                return x % 2 == 0
                  ? renderToPng({
                      ...params,
                      weaponAnic: tick,
                      colorTick: tick,
                    })
                  : renderToPng({
                      ...params,
                      weaponAnic: tick,
                      colorTick: tick,
                      frame: params.frame + (x % 4 === 1 ? 1 : 2),
                    });
              }),
          );
        } else if (ACTION_FRAMES_2PNG.includes(params.frame)) {
          return Promise.all(
            Array.from({ length: dyeLen }, (_, i) => i)
              .reverse()
              .map((x) => {
                const tick = Math.floor(x / COLOR_TICK_HOLD);
                return x % 2 == 0
                  ? renderToPng({
                      ...params,
                      weaponAnic: tick,
                      colorTick: tick,
                    })
                  : renderToPng({
                      ...params,
                      weaponAnic: tick,
                      colorTick: tick,
                      frame: params.frame - 1,
                    });
              }),
          );
        } else if (ACTION_FRAMES_KITE.includes(params.frame)) {
          return Promise.all(
            Array.from({ length: dyeLen }, (_, i) => i)
              .reverse()
              .map((x) => {
                const tick = Math.floor(x / COLOR_TICK_HOLD);
                return renderToPng({
                  ...params,
                  weaponAnic: tick,
                  colorTick: tick,
                  frame: 118 - (x % 4),
                });
              }),
          );
        }
      }
      return Promise.all(
        Array.from({ length: dyeLen }, (_, i) => i)
          .reverse()
          .map((x) => {
            const tick = Math.floor(x / COLOR_TICK_HOLD);
            return renderToPng({
              ...params,
              weaponAnic: tick,
              colorTick: tick,
            });
          }),
      );
    }

    // 비-염색 애니메이션 계열. PAL 자체에 색상순환이 있으면 그것도 반영.
    const colorPeriod = getRenderColorPeriod(params);

    // 액션은 spriteFrameAt(i) 로 액션 루프를 정의하고, 총 프레임 수는
    // LCM(loopLen, colorPeriod * HOLD) 으로 잡아 액션 사이클 사이에서도
    // 색상 애니메이션이 끊기지 않고 한 사이클을 완주하도록 한다.
    const runAction = (
      loopLen: number,
      spriteFrameAt: (i: number) => number,
    ) => {
      const total =
        colorPeriod > 1 ? lcm(loopLen, colorPeriod * COLOR_TICK_HOLD) : loopLen;
      return Promise.all(
        Array.from({ length: total }, (_, i) =>
          renderToPng({
            ...params,
            frame: spriteFrameAt(i),
            colorTick: Math.floor(i / COLOR_TICK_HOLD),
          }),
        ),
      );
    };

    if (params.isAction) {
      if (ACTION_FRAMES_3PNG.includes(params.frame)) {
        // 액션 루프 4프레임: base, base+1, base, base+2
        return runAction(4, (i) => {
          const k = i % 4;
          if (k === 1) return params.frame + 1;
          if (k === 3) return params.frame + 2;
          return params.frame;
        });
      } else if (ACTION_FRAMES_2PNG.includes(params.frame)) {
        // 액션 루프 2프레임: base, base-1
        return runAction(2, (i) =>
          i % 2 === 0 ? params.frame : params.frame - 1,
        );
      } else if (ACTION_FRAMES_KITE.includes(params.frame)) {
        // 액션 루프 4프레임: 115, 116, 117, 118
        return runAction(4, (i) => 115 + (i % 4));
      }
    }

    // 액션 아닌 정적 프레임이지만 PAL에 색상순환이 있으면 APNG로 반환.
    // colorPeriod * COLOR_TICK_HOLD 프레임을 출력해서 각 색상 단계가
    // COLOR_TICK_HOLD 프레임 동안 유지되도록 함.
    if (colorPeriod > 1) {
      const total = colorPeriod * COLOR_TICK_HOLD;
      return Promise.all(
        Array.from({ length: total }, (_, i) =>
          renderToPng({
            ...params,
            colorTick: Math.floor(i / COLOR_TICK_HOLD),
          }),
        ),
      );
    }

    // 진짜 단일 프레임
    return [await renderToPng(params)];
  }
}
