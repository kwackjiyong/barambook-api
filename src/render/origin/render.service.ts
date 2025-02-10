import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Render } from './render.schema';

@Injectable()
export class RenderService {
  constructor(
    @InjectModel('render_origin_datas', 'barambook')
    private renderModel: Model<Render>,
  ) {}
  findRenderOrigins(): Promise<Render | null> {
    return this.renderModel.findOne().exec();
  }
}
