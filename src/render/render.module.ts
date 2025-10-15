import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RenderService } from './origin/render.service';
import { RenderController } from './render.controller';
import { RenderSchema } from './origin/render.schema';
import { RenderHairColorSchema } from './hair-color/render.schema';
import { RenderBodyColorSchema } from './body-color/render.schema';
import { RenderBodyColorService } from './body-color/render.service';
import { RenderHairColorService } from './hair-color/render.service';
import { RenderFrameService } from './frame/render.service';
import { RenderFrameSchema } from './frame/render.schema';
import { RenderWeaponColorSchema } from './weapon-color/render.schema';
import { RenderWeaponColorService } from './weapon-color/render.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'render_origin_datas', schema: RenderSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'render_body_colors', schema: RenderBodyColorSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'render_hair_colors', schema: RenderHairColorSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'render_weapon_colors', schema: RenderWeaponColorSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'render_frames', schema: RenderFrameSchema }],
      'barambook',
    ),
  ],
  providers: [
    RenderService,
    RenderBodyColorService,
    RenderHairColorService,
    RenderWeaponColorService,
    RenderFrameService,
  ],
  controllers: [RenderController],
})
export class RenderModule {}
