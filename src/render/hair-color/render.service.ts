import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RenderHairColor } from './render.schema';

@Injectable()
export class RenderHairColorService {
  constructor(
    @InjectModel('render_hair_colors', 'barambook')
    private renderModel: Model<RenderHairColor>,
  ) {}
  findRenderHairColors(): Promise<RenderHairColor[]> {
    return this.renderModel.find();
  }
}
