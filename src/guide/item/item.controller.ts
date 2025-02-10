import { Controller, Get } from '@nestjs/common';
import { ItemService } from './origin/item.service';
import { Item } from './origin/item.schema';
import { ItemMixService } from './item-mix/item-mix.service';
import { ItemMix } from './item-mix/item-mix.schema';

@Controller('item')
export class ItemController {
  constructor(
    private readonly service: ItemService,
    private readonly mixService: ItemMixService,
  ) {}

  @Get()
  findAllItems(): Promise<Item | null> {
    return this.service.findAllItems();
  }

  @Get('mix')
  findAllMixItems(): Promise<ItemMix[]> {
    return this.mixService.findAllMixItems();
  }
}
