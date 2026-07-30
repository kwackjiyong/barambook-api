import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  OldBaramRenderer,
  type OldBaramRenderRequest,
} from '../lib/old-baram/renderer';

@Injectable()
export class OldBaramRendererService implements OnModuleInit {
  private readonly renderer = new OldBaramRenderer();

  onModuleInit(): void {
    this.renderer.load();
  }

  render(params: OldBaramRenderRequest): Buffer {
    return this.renderer.render(params);
  }

  getOptions() {
    return this.renderer.getOptions();
  }
}

