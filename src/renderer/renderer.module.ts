import { Module } from '@nestjs/common';
import { RendererController } from './renderer.controller';
import { RendererService } from './renderer.service';
import { OldBaramRendererService } from './old-baram-renderer.service';

@Module({
  controllers: [RendererController],
  providers: [RendererService, OldBaramRendererService],
  exports: [RendererService, OldBaramRendererService],
})
export class RendererModule {}
