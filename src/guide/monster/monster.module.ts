import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MonsterService } from './origin/monster.service';
import { MonsterController } from './monster.controller';
import { MonsterSchema } from './origin/monster.schema';
import { MonsterMapService } from './monster-map/monster-map.service';
import { MonsterMapSchema } from './monster-map/monster-map.schema';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'monsters', schema: MonsterSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'monster_maps', schema: MonsterMapSchema }],
      'barambook',
    ),
  ],
  providers: [MonsterService, MonsterMapService],
  controllers: [MonsterController],
})
export class MonsterModule {}
