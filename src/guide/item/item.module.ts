import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemService } from './origin/item.service';
import { ItemController } from './item.controller';
import { ItemSchema } from './origin/item.schema';
import { ItemMixSchema } from './item-mix/item-mix.schema';
import { ItemMixService } from './item-mix/item-mix.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'items', schema: ItemSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'item_mixs', schema: ItemMixSchema }],
      'barambook',
    ),
  ],
  providers: [ItemService, ItemMixService],
  controllers: [ItemController],
})
export class ItemModule {}
