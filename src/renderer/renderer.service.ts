/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { renderToPng } from '../lib/renderer';
import { RenderParams } from '../lib/types';
import { makeAPNGBase64 } from 'src/lib/apngEncoder';

@Injectable()
export class RendererService {
  async render(params: RenderParams) {
    // 애니메이션 계열인 경우
    if ([255, 510, 765].includes(params.weaponc)) {
      if (params.isAction) {
        if (
          [
            0, 3, 6, 9, 12, 15, 18, 21, 32, 35, 38, 41, 52, 55, 58, 61, 80, 83,
            86, 89,
          ].includes(params.frame)
        ) {
          const pngBuffers = await Promise.all(
            // 32 프레임
            Array.from({ length: 32 }, (_, i) => i)
              .reverse()
              .map((x: number) => {
                return x % 2 == 0
                  ? renderToPng({ ...params, weaponAnic: x })
                  : renderToPng({
                      ...params,
                      weaponAnic: x,
                      frame: params.frame + (x % 4 === 1 ? 1 : 2),
                    });
              }),
          );
          return makeAPNGBase64(
            pngBuffers.map((b) => {
              return { png: b, delayNum: 3.3 };
            }),
            { loopCount: 0 },
          );
        } else if ([25, 27, 29, 31, 45, 47, 49, 51].includes(params.frame)) {
          const pngBuffers = await Promise.all(
            // 32 프레임
            Array.from({ length: 32 }, (_, i) => i)
              .reverse()
              .map((x: number) => {
                return x % 2 == 0
                  ? renderToPng({ ...params, weaponAnic: x })
                  : renderToPng({
                      ...params,
                      weaponAnic: x,
                      frame: params.frame - 1,
                    });
              }),
          );
          return makeAPNGBase64(
            pngBuffers.map((b) => {
              return { png: b, delayNum: 3.3 };
            }),
            { loopCount: 0 },
          );
        } else if ([115, 116, 117, 118].includes(params.frame)) {
          const pngBuffers = await Promise.all(
            // 32 프레임
            Array.from({ length: 32 }, (_, i) => i)
              .reverse()
              .map((x: number) => {
                return renderToPng({
                  ...params,
                  weaponAnic: x,
                  frame: 118 - (x % 4),
                });
              }),
          );
          return makeAPNGBase64(
            pngBuffers.map((b) => {
              return { png: b, delayNum: 3.3 };
            }),
            { loopCount: 0 },
          );
        }
      }
      const pngBuffers = await Promise.all(
        // 32 프레임
        Array.from({ length: 32 }, (_, i) => i)
          .reverse()
          .map((x: number) => renderToPng({ ...params, weaponAnic: x })),
      );
      return makeAPNGBase64(
        pngBuffers.map((b) => {
          return { png: b, delayNum: 3.3 };
        }),
        { loopCount: 0 },
      );
    } else {
      if (params.isAction) {
        if (
          [
            0, 3, 6, 9, 12, 15, 18, 21, 32, 35, 38, 41, 52, 55, 58, 61, 80, 83,
            86, 89,
          ].includes(params.frame)
        ) {
          const pngBuffers = await Promise.all([
            renderToPng(params),
            renderToPng({ ...params, frame: params.frame + 1 }),
            renderToPng(params),
            renderToPng({ ...params, frame: params.frame + 2 }),
          ]);
          return makeAPNGBase64(
            pngBuffers.map((b) => {
              return { png: b, delayNum: 3.3 };
            }),
            { loopCount: 0 },
          );
        } else if ([25, 27, 29, 31, 45, 47, 49, 51].includes(params.frame)) {
          const pngBuffers = await Promise.all([
            renderToPng(params),
            renderToPng({ ...params, frame: params.frame - 1 }),
          ]);
          return makeAPNGBase64(
            pngBuffers.map((b) => {
              return { png: b, delayNum: 3.3 };
            }),
            { loopCount: 0 },
          );
        } else if ([115, 116, 117, 118].includes(params.frame)) {
          const pngBuffers = await Promise.all(
            // 32 프레임
            Array.from({ length: 4 }, (_, i) => i)
              .reverse()
              .map((x: number) => {
                return renderToPng({
                  ...params,
                  frame: 118 - (x % 4),
                });
              }),
          );
          return makeAPNGBase64(
            pngBuffers.map((b) => {
              return { png: b, delayNum: 3.3 };
            }),
            { loopCount: 0 },
          );
        }
      }
      return await renderToPng(params);
    }
  }
}
