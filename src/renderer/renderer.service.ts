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
                  ? renderToPng({ ...params, weaponAnic: x, colorTick: x })
                  : renderToPng({
                      ...params,
                      weaponAnic: x,
                      colorTick: x,
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
                  ? renderToPng({ ...params, weaponAnic: x, colorTick: x })
                  : renderToPng({
                      ...params,
                      weaponAnic: x,
                      colorTick: x,
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
                  colorTick: x,
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
            renderToPng({ ...params, weaponAnic: x, colorTick: x }),
          ),
      );
    }

    // 비-염색 애니메이션 계열. PAL 자체에 색상순환이 있으면 그것도 반영.
    const colorPeriod = getRenderColorPeriod(params);

    if (params.isAction) {
      if (ACTION_FRAMES_3PNG.includes(params.frame)) {
        return Promise.all([
          renderToPng({ ...params, colorTick: 0 }),
          renderToPng({ ...params, frame: params.frame + 1, colorTick: 1 }),
          renderToPng({ ...params, colorTick: 2 }),
          renderToPng({ ...params, frame: params.frame + 2, colorTick: 3 }),
        ]);
      } else if (ACTION_FRAMES_2PNG.includes(params.frame)) {
        return Promise.all([
          renderToPng({ ...params, colorTick: 0 }),
          renderToPng({ ...params, frame: params.frame - 1, colorTick: 1 }),
        ]);
      } else if (ACTION_FRAMES_KITE.includes(params.frame)) {
        return Promise.all(
          Array.from({ length: 4 }, (_, i) => i)
            .reverse()
            .map((x) =>
              renderToPng({
                ...params,
                frame: 118 - (x % 4),
                colorTick: x,
              }),
            ),
        );
      }
    }

    // 액션 아닌 정적 프레임이지만 PAL에 색상순환이 있으면 APNG로 반환
    if (colorPeriod > 1) {
      return Promise.all(
        Array.from({ length: colorPeriod }, (_, i) =>
          renderToPng({ ...params, colorTick: i }),
        ),
      );
    }

    // 진짜 단일 프레임
    return [await renderToPng(params)];
  }
}
