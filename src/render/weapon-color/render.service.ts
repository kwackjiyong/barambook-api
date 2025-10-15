import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RenderWeaponColor } from './render.schema';

@Injectable()
export class RenderWeaponColorService {
  constructor(
    @InjectModel('render_weapon_colors', 'barambook')
    private renderModel: Model<RenderWeaponColor>,
  ) {}
  findRenderWeaponColors(): Promise<RenderWeaponColor[]> {
    return this.renderModel.find();
  }
}
