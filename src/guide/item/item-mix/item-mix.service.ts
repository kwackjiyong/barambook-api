import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemMix } from './item-mix.schema';

@Injectable()
export class ItemMixService {
  constructor(
    @InjectModel('item_mixs', 'barambook')
    private itemMixModel: Model<ItemMix>,
  ) {}
  findAllMixItems(): Promise<ItemMix[]> {
    return this.itemMixModel.find();
  }
}
