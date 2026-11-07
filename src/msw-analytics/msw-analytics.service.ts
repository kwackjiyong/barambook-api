import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, FilterQuery, Model } from 'mongoose';
import { IngestMswEventsDto } from './dto/ingest-msw-events.dto';
import { MswEvent, MswEventType, MswPlayer } from './msw-analytics.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 이벤트 하나의 data가 이보다 크면 잘라서 저장한다 (게임 쪽 실수로 큰 테이블이 와도 DB가 버티게).
const MAX_DATA_JSON = 2000;
const CLASS_NAMES = ['평민', '전사', '도적', '주술사', '도사'];

function clampData(data: Record<string, unknown> | undefined) {
  if (!data) return {};
  const json = JSON.stringify(data);
  if (json.length <= MAX_DATA_JSON) return data;
  return { truncated: true, raw: json.slice(0, MAX_DATA_JSON) };
}

/** KST 기준 자정 (Date). */
function kstMidnight(now: Date, daysAgo = 0) {
  const shifted = now.getTime() + KST_OFFSET_MS;
  const midnight = shifted - (shifted % DAY_MS) - daysAgo * DAY_MS;
  return new Date(midnight - KST_OFFSET_MS);
}

@Injectable()
export class MswAnalyticsService {
  constructor(
    @InjectModel('msw_events', 'barambook')
    private readonly eventModel: Model<MswEvent>,
    @InjectModel('msw_players', 'barambook')
    private readonly playerModel: Model<MswPlayer>,
  ) {}

  async ingest(dto: IngestMswEventsDto) {
    const instance = dto.instance ?? '';
    const docs = dto.events.map((event) => ({
      type: event.type,
      userId: event.userId,
      name: event.name ?? '',
      level: event.level ?? 0,
      classCode: event.classCode ?? 0,
      map: event.map ?? '',
      at: new Date(event.at * 1000),
      instance,
      data: clampData(event.data),
    }));
    await this.eventModel.insertMany(docs, { ordered: false });

    const ops: AnyBulkWriteOperation<MswPlayer>[] = docs.map((doc) => {
      const set: Record<string, unknown> = {};
      if (doc.name) set.name = doc.name;
      if (doc.level > 0) {
        set.level = doc.level;
        set.classCode = doc.classCode;
      }
      if (doc.map) set.lastMap = doc.map;
      const inc: Record<string, number> = {};
      if (doc.type === 'login') inc.logins = 1;
      const played = Number(doc.data.playSeconds);
      if (doc.type === 'logout' && Number.isFinite(played) && played > 0) {
        inc.playSeconds = Math.min(Math.floor(played), 7 * 24 * 60 * 60);
      }
      const update: Record<string, unknown> = {
        $setOnInsert: { firstSeenAt: doc.at },
        $max: { lastSeenAt: doc.at, maxLevel: doc.level },
      };
      if (Object.keys(set).length > 0) update.$set = set;
      if (Object.keys(inc).length > 0) update.$inc = inc;
      return {
        updateOne: { filter: { _id: doc.userId }, update, upsert: true },
      };
    });
    await this.playerModel.bulkWrite(ops, { ordered: true });
    return { result: 'ok', accepted: docs.length };
  }

  async summary(now = new Date()) {
    const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const todayStart = kstMidnight(now);
    const [
      players,
      active1,
      active7,
      active30,
      newToday,
      levelBuckets,
      classes,
      top,
      events24h,
      daily,
      playTime,
    ] = await Promise.all([
      this.playerModel.countDocuments(),
      this.playerModel.countDocuments({ lastSeenAt: { $gte: since(1) } }),
      this.playerModel.countDocuments({ lastSeenAt: { $gte: since(7) } }),
      this.playerModel.countDocuments({ lastSeenAt: { $gte: since(30) } }),
      this.playerModel.countDocuments({ firstSeenAt: { $gte: todayStart } }),
      this.playerModel.aggregate<{ _id: number; count: number }>([
        {
          $group: {
            _id: {
              $multiply: [{ $floor: { $divide: ['$maxLevel', 10] } }, 10],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.playerModel.aggregate<{ _id: number; count: number }>([
        { $group: { _id: '$classCode', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.playerModel
        .find(
          {},
          {
            name: 1,
            level: 1,
            maxLevel: 1,
            classCode: 1,
            lastSeenAt: 1,
            playSeconds: 1,
          },
        )
        .sort({ maxLevel: -1, lastSeenAt: -1 })
        .limit(20)
        .lean(),
      this.eventModel.aggregate<{ _id: MswEventType; count: number }>([
        { $match: { at: { $gte: since(1) } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.eventModel.aggregate<{ _id: string; users: number; logins: number }>(
        [
          { $match: { at: { $gte: kstMidnight(now, 13) } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$at',
                  timezone: '+09:00',
                },
              },
              userIds: { $addToSet: '$userId' },
              logins: { $sum: { $cond: [{ $eq: ['$type', 'login'] }, 1, 0] } },
            },
          },
          { $project: { users: { $size: '$userIds' }, logins: 1 } },
          { $sort: { _id: 1 } },
        ],
      ),
      this.playerModel.aggregate<{ _id: null; total: number }>([
        { $group: { _id: null, total: { $sum: '$playSeconds' } } },
      ]),
    ]);

    return {
      players,
      active: { day: active1, week: active7, month: active30 },
      newToday,
      totalPlayHours: Math.round(((playTime[0]?.total ?? 0) / 3600) * 10) / 10,
      levels: levelBuckets.map((row) => ({
        range: `${row._id}~${row._id + 9}`,
        count: row.count,
      })),
      classes: classes.map((row) => ({
        classCode: row._id,
        name: CLASS_NAMES[row._id] ?? String(row._id),
        count: row.count,
      })),
      top,
      events24h: events24h.map((row) => ({ type: row._id, count: row.count })),
      daily: daily.map((row) => ({
        day: row._id,
        users: row.users,
        logins: row.logins,
      })),
    };
  }

  players(sort: 'recent' | 'level', limit: number) {
    const order: Record<string, 1 | -1> =
      sort === 'level' ? { maxLevel: -1, lastSeenAt: -1 } : { lastSeenAt: -1 };
    return this.playerModel.find().sort(order).limit(limit).lean();
  }

  events(
    filter: { userId?: string; name?: string; type?: string },
    limit: number,
  ) {
    const query: FilterQuery<MswEvent> = {};
    if (filter.userId) query.userId = filter.userId;
    if (filter.name) query.name = filter.name;
    if (filter.type) query.type = filter.type;
    return this.eventModel.find(query).sort({ at: -1 }).limit(limit).lean();
  }
}
