/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { renderToPng } from '../lib/renderer';
import { RenderParams } from '../lib/types';
import { GifService } from 'src/lib/gifEncoder';
import { makeAPNGBase64 } from 'src/lib/apngEncoder';

@Injectable()
export class RendererService {
  async render(params: RenderParams) {
    // return await renderToPng(params);
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
        return GifService().makeGifFromPngBuffers(pngBuffers);
      } else if ([25, 27, 29, 31, 45, 47, 49, 51].includes(params.frame)) {
        const pngBuffers = await Promise.all([
          renderToPng(params),
          renderToPng({ ...params, frame: params.frame - 1 }),
        ]);
        return GifService().makeGifFromPngBuffers(pngBuffers, {
          delayMs: 333,
          optimized: false,
        });
      } else {
        return await renderToPng(params);
      }
    } else {
      if ([255, 510, 765].includes(params.weaponc)) {
        // 애니메이션 계열인 경우
        const pngBuffers = await Promise.all(
          // 32 프레임
          Array.from({ length: 32 }, (_, i) => i)
            .reverse()
            .map((x: number) => renderToPng({ ...params, weaponAnic: x })),
        );
        return makeAPNGBase64(
          pngBuffers.map((b) => {
            return { png: b, delayNum: 5 };
          }),
          { loopCount: 0 },
        );
      } else {
        return await renderToPng(params);
      }
    }
  }
}
