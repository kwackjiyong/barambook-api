import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Item } from './item.schema';

@Injectable()
export class ItemService {
  constructor(
    @InjectModel('items', 'barambook')
    private itemModel: Model<Item>,
  ) {}
  findAllItems(): Promise<Item | null> {
    return this.itemModel.findOne().exec();
  }
}
