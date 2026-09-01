import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { mazeWeekAt } from './maze.rule';
import { MazeMap } from './maze.schema';

@Injectable()
export class MazeService {
  constructor(
    @InjectModel('maze_maps', 'barambook')
    private readonly mazeModel: Model<MazeMap>,
  ) {}

  // 이번 주 것만 내보낸다. 다른 주차를 조회하는 경로는 일부러 두지 않는다.
  async getCurrent() {
    const week = mazeWeekAt(Date.now());
    const maps = await this.mazeModel
      .find({ index: week.index })
      .sort({ base: 1 })
      .select({
        _id: 0,
        base: 1,
        name: 1,
        imageKey: 1,
        width: 1,
        height: 1,
        imageWidth: 1,
        imageHeight: 1,
        portals: 1,
      })
      .lean()
      .exec();

    return {
      year: week.year,
      weekNumber: week.weekNumber,
      weeksInYear: week.weeksInYear,
      startsAt: new Date(week.startsAtMs).toISOString(),
      endsAt: new Date(week.endsAtMs).toISOString(),
      maps,
    };
  }
}
