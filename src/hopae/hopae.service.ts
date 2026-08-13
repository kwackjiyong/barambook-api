import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';
import { ChatUserV4 } from '../chat-feed/chat-feed.schema';
import { UserV3 } from '../ranking/ranking.schema';
import { HopaeSearch, UserV2 } from './hopae.schema';

type NamedV2 = Pick<UserV2, 'Name'>;
type NamedV3 = Pick<UserV3, 'Name'>;
type NamedV4 = Pick<ChatUserV4, 'name'>;

@Injectable()
export class HopaeService {
  constructor(
    @InjectModel('v2_users', 'barambook')
    private readonly userV2Model: Model<UserV2>,
    @InjectModel('user_v3', 'barambook')
    private readonly userV3Model: Model<UserV3>,
    @InjectModel('v4_chat_users', 'barambook')
    private readonly chatUserV4Model: Model<ChatUserV4>,
    @InjectModel('hopae_searches', 'barambook')
    private readonly hopaeSearchModel: Model<HopaeSearch>,
  ) {}

  async searchByName(rawName: string, ipAddress: string) {
    const name = rawName.trim();
    const names = new Set<string>([name]);

    const legacyUser = await this.userV2Model
      .findOne({ Name: name })
      .select({ _id: 0, Name: 1, MSWID: 1 })
      .lean()
      .exec();

    if (legacyUser && this.hasAccountId(legacyUser.MSWID)) {
      const legacySiblings = await this.userV2Model
        .find({ MSWID: legacyUser.MSWID })
        .select({ _id: 0, Name: 1 })
        .lean()
        .exec();

      this.addNames(names, legacySiblings, (row) => row.Name);
    }

    const seedNames = [...names];
    const [chatAccountIds, rankingAccountIds] = await Promise.all([
      this.chatUserV4Model
        .distinct('worldTagId', { name: { $in: seedNames } })
        .exec(),
      this.userV3Model.distinct('MswKey', { Name: { $in: seedNames } }).exec(),
    ]);

    const accountIds = [
      ...new Set(
        [...chatAccountIds, ...rankingAccountIds]
          .map((value) =>
            String(value ?? '')
              .trim()
              .toLowerCase(),
          )
          .filter((value) => /^[a-z0-9]{5}$/.test(value)),
      ),
    ];

    const found = Boolean(legacyUser) || accountIds.length > 0;

    if (accountIds.length > 0) {
      const [chatSiblings, rankingSiblings] = await Promise.all([
        this.chatUserV4Model
          .find({ worldTagId: { $in: accountIds } })
          .select({ _id: 0, name: 1 })
          .lean()
          .exec(),
        this.userV3Model
          .find({ MswKey: { $in: accountIds } })
          .select({ _id: 0, Name: 1 })
          .lean()
          .exec(),
      ]);

      this.addNames(names, chatSiblings, (row) => row.name);
      this.addNames(names, rankingSiblings, (row) => row.Name);
    }

    if (found) {
      await this.recordSearch(name, ipAddress);
    }

    const linkedNames = [...names]
      .filter((item) => item !== name)
      .sort((a, b) => a.localeCompare(b, 'ko'));

    return { query: name, names: [name, ...linkedNames] };
  }

  async getDailyRanking(limit = 5) {
    const rows = await this.hopaeSearchModel
      .aggregate<{
        _id: string;
        searchCount: number;
      }>([{ $match: { searchDateKey: this.getDateKey() } }, { $group: { _id: '$Name', searchCount: { $sum: 1 } } }, { $sort: { searchCount: -1, _id: 1 } }, { $limit: limit }])
      .exec();

    return rows.map((row) => ({ name: row._id, searchCount: row.searchCount }));
  }

  private async recordSearch(name: string, ipAddress: string) {
    const searchDateKey = this.getDateKey();
    const ipHash = createHash('sha256')
      .update(ipAddress || 'unknown')
      .digest('hex');

    try {
      await this.hopaeSearchModel
        .updateOne(
          { ipHash, Name: name, searchDateKey },
          { $setOnInsert: { ipHash, Name: name, searchDateKey } },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
  }

  private getDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private hasAccountId(value: unknown) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  private addNames<T>(
    target: Set<string>,
    rows: T[],
    selectName: (row: T) => string,
  ) {
    for (const row of rows) {
      const name = selectName(row)?.trim();
      if (name) target.add(name);
    }
  }
}
