import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RenderBodyColor } from './render.schema';

@Injectable()
export class RenderBodyColorService {
  constructor(
    @InjectModel('render_body_colors', 'barambook')
    private renderModel: Model<RenderBodyColor>,
  ) {}
  findRenderBodyColors(): Promise<RenderBodyColor[]> {
    return this.renderModel.find();
  }
}
