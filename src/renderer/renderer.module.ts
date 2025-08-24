import { Module } from '@nestjs/common';
import { RendererController } from './renderer.controller';
import { RendererService } from './renderer.service';

@Module({
  controllers: [RendererController],
  providers: [RendererService],
  exports: [RendererService],
})
export class RendererModule {}
