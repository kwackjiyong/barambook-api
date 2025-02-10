import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MapPortal } from './map.schema';

@Injectable()
export class MapPortalService {
  constructor(
    @InjectModel('map_portals', 'barambook')
    private mapModel: Model<MapPortal>,
  ) {}
  findMapPortals(): Promise<MapPortal[]> {
    return this.mapModel.find();
  }
}
