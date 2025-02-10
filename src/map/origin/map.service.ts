import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Map } from './map.schema';

@Injectable()
export class MapService {
  constructor(
    @InjectModel('map_guides', 'barambook')
    private mapModel: Model<Map>,
  ) {}
  findMapGuides(): Promise<Map[]> {
    return this.mapModel.find();
  }
}
