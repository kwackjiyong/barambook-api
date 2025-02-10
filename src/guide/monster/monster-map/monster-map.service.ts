import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MonsterMap } from './monster-map.schema';

@Injectable()
export class MonsterMapService {
  constructor(
    @InjectModel('monster_maps', 'barambook')
    private monsterMapModel: Model<MonsterMap>,
  ) {}
  findAllMonsterMap(): Promise<MonsterMap[]> {
    return this.monsterMapModel.find();
  }
}
