import { Injectable } from '@nestjs/common';
import { renderToPng } from '../lib/renderer';
import { RenderParams } from '../lib/types';

@Injectable()
export class RendererService {
  async render(params: RenderParams) {
    return await renderToPng(params);
  }
}
