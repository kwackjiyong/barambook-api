import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RenderFrame } from './render.schema';

@Injectable()
export class RenderFrameService {
  constructor(
    @InjectModel('render_frames', 'barambook')
    private renderModel: Model<RenderFrame>,
  ) {}
  findRenderFrames(): Promise<RenderFrame[]> {
    return this.renderModel.find();
  }
}
