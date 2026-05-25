/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { renderToPng } from '../lib/renderer';
import { getRenderColorPeriod } from '../lib/paletteAnimation';
import { RenderParams } from '../lib/types';
import { makeAPNGBase64 } from 'src/lib/apngEncoder';

const ACTION_FRAMES_3PNG = [
  0, 3, 6, 9, 12, 15, 18, 21, 32, 35, 38, 41, 52, 55, 58, 61, 80, 83, 86, 89,
];
const ACTION_FRAMES_2PNG = [25, 27, 29, 31, 45, 47, 49, 51];
const ACTION_FRAMES_KITE = [115, 116, 117, 118];

// Color cycling holds each tick for N output frames. Higher = slower color
// transition. Frame-based weapon/action animations stay at their original
// speed because they advance once per output frame regardless.
const COLOR_TICK_HOLD = 2;

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
    if ([255, 510, 765].includes(params.weaponc)) {
      if (params.isAction) {
        if (ACTION_FRAMES_3PNG.includes(params.frame)) {
          return Promise.all(
            Array.from({ length: 32 }, (_, i) => i)
              .reverse()
              .map((x) =>
                x % 2 == 0
                  ? renderToPng({
                      ...params,
                      weaponAnic: x,
                      colorTick: Math.floor(x / COLOR_TICK_HOLD),
                    })
                  : renderToPng({
                      ...params,
                      weaponAnic: x,
                      colorTick: Math.floor(x / COLOR_TICK_HOLD),
                      frame: params.frame + (x % 4 === 1 ? 1 : 2),
                    }),
              ),
          );
        } else if (ACTION_FRAMES_2PNG.includes(params.frame)) {
          return Promise.all(
            Array.from({ length: 32 }, (_, i) => i)
              .reverse()
              .map((x) =>
                x % 2 == 0
                  ? renderToPng({
                      ...params,
                      weaponAnic: x,
                      colorTick: Math.floor(x / COLOR_TICK_HOLD),
                    })
                  : renderToPng({
                      ...params,
                      weaponAnic: x,
                      colorTick: Math.floor(x / COLOR_TICK_HOLD),
                      frame: params.frame - 1,
                    }),
              ),
          );
        } else if (ACTION_FRAMES_KITE.includes(params.frame)) {
          return Promise.all(
            Array.from({ length: 32 }, (_, i) => i)
              .reverse()
              .map((x) =>
                renderToPng({
                  ...params,
                  weaponAnic: x,
                  colorTick: Math.floor(x / COLOR_TICK_HOLD),
                  frame: 118 - (x % 4),
                }),
              ),
          );
        }
      }
      return Promise.all(
        Array.from({ length: 32 }, (_, i) => i)
          .reverse()
          .map((x) =>
            renderToPng({
              ...params,
              weaponAnic: x,
              colorTick: Math.floor(x / COLOR_TICK_HOLD),
            }),
          ),
      );
    }

    // 비-염색 애니메이션 계열. PAL 자체에 색상순환이 있으면 그것도 반영.
    const colorPeriod = getRenderColorPeriod(params);

    if (params.isAction) {
      if (ACTION_FRAMES_3PNG.includes(params.frame)) {
        return Promise.all([
          renderToPng({ ...params, colorTick: 0 }),
          renderToPng({
            ...params,
            frame: params.frame + 1,
            colorTick: Math.floor(1 / COLOR_TICK_HOLD),
          }),
          renderToPng({ ...params, colorTick: Math.floor(2 / COLOR_TICK_HOLD) }),
          renderToPng({
            ...params,
            frame: params.frame + 2,
            colorTick: Math.floor(3 / COLOR_TICK_HOLD),
          }),
        ]);
      } else if (ACTION_FRAMES_2PNG.includes(params.frame)) {
        return Promise.all([
          renderToPng({ ...params, colorTick: 0 }),
          renderToPng({
            ...params,
            frame: params.frame - 1,
            colorTick: Math.floor(1 / COLOR_TICK_HOLD),
          }),
        ]);
      } else if (ACTION_FRAMES_KITE.includes(params.frame)) {
        return Promise.all(
          Array.from({ length: 4 }, (_, i) => i)
            .reverse()
            .map((x) =>
              renderToPng({
                ...params,
                frame: 118 - (x % 4),
                colorTick: Math.floor(x / COLOR_TICK_HOLD),
              }),
            ),
        );
      }
    }

    // 액션 아닌 정적 프레임이지만 PAL에 색상순환이 있으면 APNG로 반환.
    // colorPeriod * COLOR_TICK_HOLD 프레임을 출력해서 각 색상 단계가
    // COLOR_TICK_HOLD 프레임 동안 유지되도록 함.
    if (colorPeriod > 1) {
      const total = colorPeriod * COLOR_TICK_HOLD;
      return Promise.all(
        Array.from({ length: total }, (_, i) =>
          renderToPng({ ...params, colorTick: Math.floor(i / COLOR_TICK_HOLD) }),
        ),
      );
    }

    // 진짜 단일 프레임
    return [await renderToPng(params)];
  }
}
