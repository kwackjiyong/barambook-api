import { Controller, Get, Param } from '@nestjs/common';
import { MonsterService } from './origin/monster.service';
import { Monster } from './origin/monster.schema';
import { MonsterMapService } from './monster-map/monster-map.service';
import { MonsterMap } from './monster-map/monster-map.schema';

@Controller('monster')
export class MonsterController {
  constructor(
    private readonly service: MonsterService,
    private readonly mapService: MonsterMapService,
  ) {}

  @Get()
  findAllMonster(): Promise<Monster[]> {
    return this.service.findAllMonster();
  }

  @Get('include/:name')
  findMonsterInName(@Param('name') name: string): Promise<Monster[]> {
    return this.service.findMonsterInName(name);
  }

  @Get('map')
  findAllMonsterMap(): Promise<MonsterMap[]> {
    return this.mapService.findAllMonsterMap();
  }
}
