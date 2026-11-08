import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, FilterQuery, Model, Types } from 'mongoose';
import { IngestMswEventsDto } from './dto/ingest-msw-events.dto';
import {
  MswDaily,
  MswDailyUser,
  MswEvent,
  MswPlayer,
} from './msw-analytics.schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 이벤트 하나의 data가 이보다 크면 잘라서 저장한다 (게임 쪽 실수로 큰 테이블이 와도 DB가 버티게).
const MAX_DATA_JSON = 2000;
const MAX_PLAY_SECONDS = 7 * 24 * 60 * 60;
const CLASS_NAMES = ['평민', '전사', '도적', '주술사', '도사'];
const KST_DAY = {
  $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: '+09:00' },
};

function clampData(data: Record<string, unknown> | undefined) {
  if (!data) return {};
  const json = JSON.stringify(data);
  if (json.length <= MAX_DATA_JSON) return data;
  return { truncated: true, raw: json.slice(0, MAX_DATA_JSON) };
}

/** KST 날짜 문자열 'YYYY-MM-DD'. */
export function kstDay(date: Date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 기준 자정 (Date). */
function kstMidnight(now: Date, daysAgo = 0) {
  const shifted = now.getTime() + KST_OFFSET_MS;
  const midnight = shifted - (shifted % DAY_MS) - daysAgo * DAY_MS;
  return new Date(midnight - KST_OFFSET_MS);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function playSecondsOf(type: string, data: Record<string, unknown>) {
  if (type !== 'logout') return 0;
  const played = Number(data.playSeconds);
  if (!Number.isFinite(played) || played <= 0) return 0;
  return Math.min(Math.floor(played), MAX_PLAY_SECONDS);
}

/**
 * bulkWrite로 새로 생긴 문서의 _id들. 순번(키)은 순서 없는 쓰기에서 연산 순서와 어긋날 수 있어
 * 쓰지 않고, _id 값만 믿는다.
 */
function upsertedIds(result: { upsertedIds?: Record<number, unknown> }) {
  return Object.values(result.upsertedIds ?? {}).map(String);
}

export type PlayerSort = 'recent' | 'level' | 'playtime' | 'new';

export interface PlayerQuery {
  sort: PlayerSort;
  q?: string;
  classCode?: number;
  skip: number;
  limit: number;
}

export interface EventQuery {
  userId?: string;
  name?: string;
  type?: string;
  from?: Date;
  to?: Date;
  /** 다음 쪽 커서: 이 이벤트(시각, _id)보다 오래된 것만. */
  before?: { at: Date; id: string };
  limit: number;
}

@Injectable()
export class MswAnalyticsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MswAnalyticsService.name);

  constructor(
    @InjectModel('msw_events', 'barambook')
    private readonly eventModel: Model<MswEvent>,
    @InjectModel('msw_players', 'barambook')
    private readonly playerModel: Model<MswPlayer>,
    @InjectModel('msw_daily', 'barambook')
    private readonly dailyModel: Model<MswDaily>,
    @InjectModel('msw_daily_users', 'barambook')
    private readonly dailyUserModel: Model<MswDailyUser>,
  ) {}

  /** 일별 집계가 생기기 전에 쌓인 이벤트가 있으면 한 번 채운다. */
  async onApplicationBootstrap() {
    try {
      const [daily, events] = await Promise.all([
        this.dailyModel.estimatedDocumentCount(),
        this.eventModel.estimatedDocumentCount(),
      ]);
      if (daily === 0 && events > 0) {
        const result = await this.rebuildDaily();
        this.logger.log(`msw_daily rebuilt: ${result.days} days`);
      }
    } catch (error) {
      this.logger.warn(`msw_daily bootstrap skipped: ${String(error)}`);
    }
  }

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

    const playerOps: AnyBulkWriteOperation<MswPlayer>[] = docs.map((doc) => {
      const set: Record<string, unknown> = {};
      if (doc.name) set.name = doc.name;
      if (doc.level > 0) {
        set.level = doc.level;
        set.classCode = doc.classCode;
      }
      if (doc.map) set.lastMap = doc.map;
      const inc: Record<string, number> = {};
      if (doc.type === 'login') inc.logins = 1;
      const played = playSecondsOf(doc.type, doc.data);
      if (played > 0) inc.playSeconds = played;
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
    const playerResult = await this.playerModel.bulkWrite(playerOps, {
      ordered: true,
    });

    // 일별 집계: 처음 보는 (하루, 계정) 쌍과 처음 보는 계정만 users·newPlayers에 더한다.
    const days = docs.map((doc) => kstDay(doc.at));
    const pairs = new Map<string, { day: string; userId: string; at: Date }>();
    docs.forEach((doc, index) => {
      const key = `${days[index]}|${doc.userId}`;
      if (!pairs.has(key))
        pairs.set(key, { day: days[index], userId: doc.userId, at: doc.at });
    });
    const pairList = [...pairs.entries()];
    const pairResult = await this.dailyUserModel.bulkWrite(
      pairList.map(([key, pair]) => ({
        updateOne: {
          filter: { _id: key },
          update: {
            $setOnInsert: {
              day: pair.day,
              userId: pair.userId,
              createdAt: pair.at,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const perDay = new Map<string, Record<string, number>>();
    const bump = (day: string, field: string, amount: number) => {
      if (amount === 0) return;
      const row = perDay.get(day) ?? {};
      row[field] = (row[field] ?? 0) + amount;
      perDay.set(day, row);
    };
    docs.forEach((doc, index) => {
      const day = days[index];
      bump(day, `events.${doc.type}`, 1);
      if (doc.type === 'login') bump(day, 'logins', 1);
      bump(day, 'playSeconds', playSecondsOf(doc.type, doc.data));
    });
    for (const key of upsertedIds(pairResult)) {
      const pair = pairs.get(key);
      if (pair) bump(pair.day, 'users', 1);
    }
    // 새 계정은 이 묶음에서 그 계정의 첫 이벤트 날(= firstSeenAt)에 센다.
    const firstDay = new Map<string, string>();
    docs.forEach((doc, index) => {
      if (!firstDay.has(doc.userId)) firstDay.set(doc.userId, days[index]);
    });
    for (const userId of upsertedIds(playerResult)) {
      const day = firstDay.get(userId);
      if (day) bump(day, 'newPlayers', 1);
    }

    await this.dailyModel.bulkWrite(
      [...perDay.entries()].map(([day, inc]) => ({
        updateOne: {
          filter: { _id: day },
          update: { $inc: inc },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return { result: 'ok', accepted: docs.length };
  }

  /**
   * 이벤트 원본에서 일별 집계를 다시 만든다 (집계가 어긋났을 때·처음 배포할 때).
   * 원본이 남아 있는 기간(1년)만 복구된다.
   */
  async rebuildDaily() {
    const dailyName = this.dailyModel.collection.collectionName;
    const pairName = this.dailyUserModel.collection.collectionName;
    await Promise.all([
      this.dailyModel.deleteMany({}),
      this.dailyUserModel.deleteMany({}),
    ]);
    await this.eventModel
      .aggregate([
        {
          $group: {
            _id: { d: KST_DAY, u: '$userId' },
            createdAt: { $min: '$at' },
          },
        },
        {
          $project: {
            _id: { $concat: ['$_id.d', '|', '$_id.u'] },
            day: '$_id.d',
            userId: '$_id.u',
            createdAt: 1,
          },
        },
        { $merge: { into: pairName, whenMatched: 'replace' } },
      ])
      .allowDiskUse(true);
    await this.eventModel
      .aggregate([
        {
          $group: {
            _id: { d: KST_DAY, t: '$type' },
            n: { $sum: 1 },
            play: {
              $sum: {
                $cond: [
                  { $eq: ['$type', 'logout'] },
                  {
                    $min: [
                      MAX_PLAY_SECONDS,
                      {
                        $max: [
                          0,
                          {
                            $convert: {
                              input: '$data.playSeconds',
                              to: 'double',
                              onError: 0,
                              onNull: 0,
                            },
                          },
                        ],
                      },
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
        {
          $group: {
            _id: '$_id.d',
            pairs: { $push: { k: '$_id.t', v: '$n' } },
            logins: {
              $sum: { $cond: [{ $eq: ['$_id.t', 'login'] }, '$n', 0] },
            },
            playSeconds: { $sum: { $floor: '$play' } },
          },
        },
        {
          $project: {
            events: { $arrayToObject: '$pairs' },
            logins: 1,
            playSeconds: 1,
            users: { $literal: 0 },
            newPlayers: { $literal: 0 },
          },
        },
        { $merge: { into: dailyName, whenMatched: 'replace' } },
      ])
      .allowDiskUse(true);
    await this.dailyUserModel
      .aggregate([
        { $group: { _id: '$day', users: { $sum: 1 } } },
        { $merge: { into: dailyName, whenMatched: 'merge' } },
      ])
      .allowDiskUse(true);
    await this.playerModel
      .aggregate([
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$firstSeenAt',
                timezone: '+09:00',
              },
            },
            newPlayers: { $sum: 1 },
          },
        },
        { $merge: { into: dailyName, whenMatched: 'merge' } },
      ])
      .allowDiskUse(true);
    const days = await this.dailyModel.estimatedDocumentCount();
    return { result: 'ok', days };
  }

  async summary(now = new Date()) {
    const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const today = kstDay(now);
    const [
      players,
      active1,
      active7,
      active30,
      levelBuckets,
      classes,
      top,
      todayRow,
      playTime,
    ] = await Promise.all([
      this.playerModel.estimatedDocumentCount(),
      this.playerModel.countDocuments({ lastSeenAt: { $gte: since(1) } }),
      this.playerModel.countDocuments({ lastSeenAt: { $gte: since(7) } }),
      this.playerModel.countDocuments({ lastSeenAt: { $gte: since(30) } }),
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
      this.dailyModel.findById(today).lean(),
      this.playerModel.aggregate<{ _id: null; total: number }>([
        { $group: { _id: null, total: { $sum: '$playSeconds' } } },
      ]),
    ]);

    const eventsToday = Object.entries(todayRow?.events ?? {})
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    return {
      players,
      active: { day: active1, week: active7, month: active30 },
      today: {
        day: today,
        users: todayRow?.users ?? 0,
        newPlayers: todayRow?.newPlayers ?? 0,
        logins: todayRow?.logins ?? 0,
      },
      newToday: todayRow?.newPlayers ?? 0,
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
      eventsToday,
    };
  }

  /** 최근 days일(KST, 오늘 포함)의 일별 집계. 빈 날은 0으로 채운다. */
  async daily(days: number, now = new Date()) {
    const first = kstDay(kstMidnight(now, days - 1));
    const rows = await this.dailyModel
      .find({ _id: { $gte: first } })
      .sort({ _id: 1 })
      .lean();
    const byDay = new Map(rows.map((row) => [row._id, row]));
    const result: {
      day: string;
      users: number;
      newPlayers: number;
      logins: number;
      playHours: number;
      events: Record<string, number>;
    }[] = [];
    for (let back = days - 1; back >= 0; back -= 1) {
      const day = kstDay(kstMidnight(now, back));
      const row = byDay.get(day);
      result.push({
        day,
        users: row?.users ?? 0,
        newPlayers: row?.newPlayers ?? 0,
        logins: row?.logins ?? 0,
        playHours: Math.round(((row?.playSeconds ?? 0) / 3600) * 10) / 10,
        events: row?.events ?? {},
      });
    }
    return result;
  }

  async players(query: PlayerQuery) {
    const orders: Record<PlayerSort, Record<string, 1 | -1>> = {
      recent: { lastSeenAt: -1 },
      level: { maxLevel: -1, lastSeenAt: -1 },
      playtime: { playSeconds: -1 },
      new: { firstSeenAt: -1 },
    };
    const filter: FilterQuery<MswPlayer> = {};
    // 앞부분 일치만 지원해 name 인덱스를 탄다.
    if (query.q) filter.name = { $regex: `^${escapeRegex(query.q)}` };
    if (query.classCode !== undefined) filter.classCode = query.classCode;
    const hasFilter = Object.keys(filter).length > 0;
    const [items, total] = await Promise.all([
      this.playerModel
        .find(filter)
        .sort(orders[query.sort])
        .skip(query.skip)
        .limit(query.limit)
        .lean(),
      hasFilter
        ? this.playerModel.countDocuments(filter)
        : this.playerModel.estimatedDocumentCount(),
    ]);
    return { items, total, skip: query.skip, limit: query.limit };
  }

  /** 최신순 이벤트. 다음 쪽은 응답의 next를 before로 넘긴다. */
  async events(query: EventQuery) {
    const filter: FilterQuery<MswEvent> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.name) filter.name = query.name;
    if (query.type) filter.type = query.type;
    const at: Record<string, Date> = {};
    if (query.from) at.$gte = query.from;
    if (query.to) at.$lt = query.to;
    if (Object.keys(at).length > 0) filter.at = at;
    // 같은 초에 여러 건이 찍히므로 (at, _id) 쌍으로 이어 받는다.
    if (query.before) {
      const { at: cursorAt, id } = query.before;
      filter.$or = [
        { at: { $lt: cursorAt } },
        { at: cursorAt, _id: { $lt: new Types.ObjectId(id) } },
      ];
    }
    const rows = await this.eventModel
      .find(filter)
      .sort({ at: -1, _id: -1 })
      .limit(query.limit + 1)
      .lean();
    const items = rows.slice(0, query.limit);
    const last = items[items.length - 1];
    const next =
      rows.length > query.limit
        ? `${last.at.getTime()}_${(last._id as Types.ObjectId).toHexString()}`
        : undefined;
    return { items, next };
  }
}
