/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { renderToPng } from '../lib/renderer';
import { RenderParams } from '../lib/types';
import { GifService } from 'src/lib/gifEncoder';

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
          optimized: true,
        });
      } else {
        return await renderToPng(params);
      }
    } else {
      if (params.weaponc === 255) {
        // 은묵인 경우
        const pngBuffers = await Promise.all([
          renderToPng({ ...params, weaponAnic: 15 }),
          renderToPng({ ...params, weaponAnic: 14 }),
          renderToPng({ ...params, weaponAnic: 13 }),
          renderToPng({ ...params, weaponAnic: 12 }),
          renderToPng({ ...params, weaponAnic: 11 }),
          renderToPng({ ...params, weaponAnic: 10 }),
          renderToPng({ ...params, weaponAnic: 9 }),
          renderToPng({ ...params, weaponAnic: 8 }),
          renderToPng({ ...params, weaponAnic: 7 }),
          renderToPng({ ...params, weaponAnic: 6 }),
          renderToPng({ ...params, weaponAnic: 5 }),
          renderToPng({ ...params, weaponAnic: 4 }),
          renderToPng({ ...params, weaponAnic: 3 }),
          renderToPng({ ...params, weaponAnic: 2 }),
          renderToPng({ ...params, weaponAnic: 1 }),
          renderToPng({ ...params, weaponAnic: 0 }),
        ]);
        return GifService().makeGifFromPngBuffers(pngBuffers, {
          delayMs: 500,
          optimized: false,
        });
      } else {
        return await renderToPng(params);
      }
    }
  }
}
