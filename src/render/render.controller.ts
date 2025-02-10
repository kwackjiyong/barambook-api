import { Controller, Get } from '@nestjs/common';
import { RenderService } from './origin/render.service';
import { Render } from './origin/render.schema';
import { RenderFrameService } from './frame/render.service';
import { RenderBodyColorService } from './body-color/render.service';
import { RenderHairColorService } from './hair-color/render.service';
import { RenderBodyColor } from './body-color/render.schema';
import { RenderHairColor } from './hair-color/render.schema';
import { RenderFrame } from './frame/render.schema';

@Controller('render')
export class RenderController {
  constructor(
    private readonly orginService: RenderService,
    private readonly frameService: RenderFrameService,
    private readonly bodyColorService: RenderBodyColorService,
    private readonly hairColorService: RenderHairColorService,
  ) {}

  @Get()
  findOriginDatas(): Promise<Render | null> {
    return this.orginService.findRenderOrigins();
  }

  @Get('body-colors')
  findBodyColors(): Promise<RenderBodyColor[]> {
    return this.bodyColorService.findRenderBodyColors();
  }

  @Get('hair-colors')
  findHairColors(): Promise<RenderHairColor[]> {
    return this.hairColorService.findRenderHairColors();
  }

  @Get('frames')
  findFrames(): Promise<RenderFrame[]> {
    return this.frameService.findRenderFrames();
  }
}
