import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Monster } from './monster.schema';

@Injectable()
export class MonsterService {
  constructor(
    @InjectModel('monsters', 'barambook')
    private monsterModel: Model<Monster>,
  ) {}
  findAllMonster(): Promise<Monster[]> {
    return this.monsterModel.find();
  }
  findMonsterInName(partialName: string): Promise<Monster[]> {
    return this.monsterModel.find({
      $or: [
        { name: { $regex: partialName } },
        { type: { $regex: partialName } },
      ],
    });
  }
}
