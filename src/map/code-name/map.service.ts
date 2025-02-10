import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MapCodeName } from './map.schema';

@Injectable()
export class MapCodeNameService {
  constructor(
    @InjectModel('map_code_names', 'barambook')
    private mapModel: Model<MapCodeName>,
  ) {}

  findMapCodeNames(): Promise<MapCodeName[]> {
    return this.mapModel.find();
  }

  findMapCodeNamesByName(partialName: string): Promise<MapCodeName[]> {
    return this.mapModel.find({
      $or: [
        { name: { $regex: partialName } },
        { type: { $regex: partialName } },
      ],
    });
  }
}
