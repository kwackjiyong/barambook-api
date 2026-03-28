import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import type { BulkWriteResult } from 'mongodb';
import { Model } from 'mongoose';
import { CharacterLike } from './character-like.schema';
import { CharacterSearch } from './character-search.schema';
import { User } from './user.schema';
import { V2User } from './v2-user.schema';

type SearchCharacter = {
  Name: string;
  ClanName?: string | null;
  Class: string;
  Nation: string;
  Level: number;
  Grade: number;
  MaxHP?: number | null;
  MaxMP?: number | null;
  MSWID?: string;
};

export type UserSearchResult = {
  Name: string;
  ClanName: string | null;
  Class: string;
  Nation: string;
  Level: number;
  Grade: number;
  MaxHP: number | null;
  MaxMP: number | null;
  likeCount: number;
  isHidden: boolean;
};

export type UserLikeRankingItem = {
  name: string;
  class: string;
  level: number;
  grade: number;
  nation: string;
  clan: string | null;
  hp: number | null;
  mp: number | null;
  searchCount: number;
};

@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel('users', 'barambook')
    private readonly userModel: Model<User>,
    @InjectModel('v2_users', 'barambook')
    private readonly v2UserModel: Model<V2User>,
    @InjectModel('character_likes', 'barambook')
    private readonly characterLikeModel: Model<CharacterLike>,
    @InjectModel('character_searches', 'barambook')
    private readonly characterSearchModel: Model<CharacterSearch>,
  ) {}

  async onModuleInit() {
    await this.ensureCharacterLikeIndexes();
    await this.ensureCharacterSearchIndexes();
  }

  findUsers(): Promise<User[]> {
    return this.userModel.find();
  }

  async findUserSearchByName(name: string): Promise<User[]> {
    const keyword = (name ?? '').trim();
    if (!keyword || keyword.length < 2) {
      return [];
    }

    return this.userModel
      .find({ Name: { $regex: keyword, $options: 'i' } })
      .lean()
      .exec();
  }

  async findUserByName(name: string, ipAddress: string): Promise<UserSearchResult[]> {
    const trimmedName = (name ?? '').trim();
    const user = await this.userModel
      .findOne({ Name: trimmedName })
      .select({ _id: 0, MSWID: 1, Name: 1 })
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException(`User not found. ${name}`);
    }

    await this.recordCharacterSearch(user.Name, ipAddress);

    const users = await this.userModel
      .find({ MSWID: user.MSWID })
      .sort({ Grade: -1, Level: -1, Name: 1 })
      .lean()
      .exec();

    const likeCountsByName = await this.getLikeCountsByNames(
      users.map((character) => character.Name),
    );

    return users.map((character) =>
      this.toUserSearchResult(character, likeCountsByName.get(character.Name) ?? 0),
    );
  }

  async findSingleUserByName(name: string, ipAddress: string): Promise<UserSearchResult> {
    const trimmedName = (name ?? '').trim();
    const character = await this.userModel.findOne({ Name: trimmedName }).lean().exec();

    if (!character) {
      throw new NotFoundException(`User not found. ${name}`);
    }

    await this.recordCharacterSearch(character.Name, ipAddress);

    return this.toUserSearchResult(
      character,
      await this.getLikeCountForName(character.Name),
    );
  }

  async findUsersByClanName(name: string): Promise<UserSearchResult[]> {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return [];
    }

    const users = await this.v2UserModel
      .find({ ClanName: trimmedName })
      .sort({ Grade: -1, Level: -1, Name: 1 })
      .lean()
      .exec();

    if (users.length === 0) {
      return [];
    }

    const likeCountsByName = await this.getLikeCountsByNames(
      users.map((character) => character.Name),
    );

    return users.map((character) =>
      this.toUserSearchResult(character, likeCountsByName.get(character.Name) ?? 0),
    );
  }

  async addCharacterLike(name: string, ipAddress: string) {
    const trimmedName = (name ?? '').trim();
    const character = await this.userModel
      .findOne({ Name: trimmedName })
      .select({ _id: 0, Name: 1 })
      .lean()
      .exec();

    if (!character) {
      throw new NotFoundException(`User not found. ${name}`);
    }

    try {
      await this.characterLikeModel.create({
        Name: character.Name,
        ipHash: this.hashIpAddress(ipAddress),
        likedDateKey: this.getLikedDateKey(),
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Only one like per IP is allowed each day.');
      }

      throw error;
    }

    return {
      name: character.Name,
      likeCount: await this.getLikeCountForName(character.Name),
    };
  }

  async getSearchRanking(limit = 10): Promise<UserLikeRankingItem[]> {
    const todayKey = this.getDateKey();
    const rankingRows = await this.characterSearchModel
      .aggregate<{ _id: string; searchCount: number }>([
        {
          $match: {
            searchDateKey: todayKey,
          },
        },
        {
          $group: {
            _id: '$Name',
            searchCount: { $sum: 1 },
          },
        },
        { $sort: { searchCount: -1, _id: 1 } },
        { $limit: Math.max(limit * 3, limit) },
      ])
      .exec();

    if (rankingRows.length === 0) {
      return [];
    }

    const names = rankingRows.map((row) => row._id);
    const users = await this.userModel
      .find({ Name: { $in: names } })
      .select({
        _id: 0,
        Name: 1,
        ClanName: 1,
        Class: 1,
        Nation: 1,
        Level: 1,
        Grade: 1,
        MaxHP: 1,
        MaxMP: 1,
      })
      .lean()
      .exec();

    const userByName = new Map(users.map((user) => [user.Name, user]));

    return rankingRows
      .filter((row) => userByName.has(row._id))
      .slice(0, limit)
      .map((row) => {
        const user = userByName.get(row._id)!;
        return {
          name: user.Name,
          class: user.Class,
          level: user.Level,
          grade: user.Grade,
          nation: user.Nation,
          clan: user.ClanName ?? null,
          hp: user.MaxHP ?? null,
          mp: user.MaxMP ?? null,
          searchCount: row.searchCount,
        };
      });
  }

  async getLikeCountForName(name: string): Promise<number> {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return 0;
    }

    return this.characterLikeModel.countDocuments({ Name: trimmedName }).exec();
  }

  async upsertV2Users(userDatas: Array<V2User>): Promise<BulkWriteResult> {
    const records = userDatas.filter(
      (record) => typeof record?.Name === 'string' && record.Name.trim().length > 0,
    );

    if (records.length === 0) {
      return {
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
        insertedCount: 0,
        deletedCount: 0,
      } as BulkWriteResult;
    }

    return this.v2UserModel.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { Name: record.Name },
          update: { $set: record },
          upsert: true,
        },
      })),
    );
  }

  private toUserSearchResult(character: SearchCharacter, likeCount: number): UserSearchResult {
    return {
      Name: character.Name,
      ClanName: character.ClanName ?? null,
      Class: character.Class,
      Nation: character.Nation,
      Level: character.Level,
      Grade: character.Grade,
      MaxHP: character.MaxHP ?? null,
      MaxMP: character.MaxMP ?? null,
      likeCount,
      isHidden: false,
    };
  }

  private async getLikeCountsByNames(names: string[]) {
    if (names.length === 0) {
      return new Map<string, number>();
    }

    const rows = await this.characterLikeModel
      .aggregate<{ _id: string; likeCount: number }>([
        {
          $match: {
            Name: { $in: names },
          },
        },
        {
          $group: {
            _id: '$Name',
            likeCount: { $sum: 1 },
          },
        },
      ])
      .exec();

    return new Map(rows.map((row) => [row._id, row.likeCount]));
  }

  private async recordCharacterSearch(name: string, ipAddress: string) {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return;
    }

    try {
      await this.characterSearchModel.create({
        Name: trimmedName,
        ipHash: this.hashIpAddress(ipAddress),
        searchDateKey: this.getDateKey(),
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        return;
      }

      throw error;
    }
  }

  private getDateKey(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return formatter.format(date);
  }

  private hashIpAddress(ipAddress: string) {
    return createHash('sha256').update(ipAddress).digest('hex');
  }

  private getLikedDateKey(date = new Date()) {
    return this.getDateKey(date);
  }

  private async ensureCharacterLikeIndexes() {
    await this.removeDuplicateLikesByIpAndDate();

    const indexes = await this.characterLikeModel.collection.indexes();
    const legacyUniqueIndexNames = indexes
      .filter((index) => {
        if (index.name === '_id_') {
          return false;
        }

        const keyNames = Object.keys(index.key ?? {});
        const isCorrectUniqueIndex =
          index.unique === true &&
          keyNames.length === 2 &&
          keyNames[0] === 'ipHash' &&
          keyNames[1] === 'likedDateKey';

        if (isCorrectUniqueIndex) {
          return false;
        }

        return index.unique === true;
      })
      .map((index) => index.name)
      .filter((indexName): indexName is string => Boolean(indexName));

    for (const indexName of legacyUniqueIndexNames) {
      await this.characterLikeModel.collection.dropIndex(indexName);
      this.logger.warn(`Dropped legacy character_likes index: ${indexName}`);
    }

    await this.characterLikeModel.collection.createIndex(
      { ipHash: 1, likedDateKey: 1 },
      { unique: true, name: 'ipHash_1_likedDateKey_1' },
    );
  }

  private async removeDuplicateLikesByIpAndDate() {
    const duplicateGroups = await this.characterLikeModel
      .aggregate<{
        _id: { ipHash: string; likedDateKey: string };
        documentIds: string[];
        count: number;
      }>([
        {
          $group: {
            _id: {
              ipHash: '$ipHash',
              likedDateKey: '$likedDateKey',
            },
            documentIds: { $push: { $toString: '$_id' } },
            count: { $sum: 1 },
          },
        },
        {
          $match: {
            count: { $gt: 1 },
          },
        },
      ])
      .exec();

    if (duplicateGroups.length === 0) {
      return;
    }

    const duplicateIdsToDelete = duplicateGroups.flatMap((group) =>
      group.documentIds.slice(1),
    );

    if (duplicateIdsToDelete.length === 0) {
      return;
    }

    const deleteResult = await this.characterLikeModel.deleteMany({
      _id: { $in: duplicateIdsToDelete },
    });

    this.logger.warn(
      `Removed ${deleteResult.deletedCount ?? 0} duplicate character_likes rows for ipHash+likedDateKey uniqueness`,
    );
  }

  private async ensureCharacterSearchIndexes() {
    await this.removeDuplicateSearchesByIpCharacterAndDate();

    const indexes = await this.characterSearchModel.collection.indexes();
    const legacyUniqueIndexNames = indexes
      .filter((index) => {
        if (index.name === '_id_') {
          return false;
        }

        const keyNames = Object.keys(index.key ?? {});
        const isCorrectUniqueIndex =
          index.unique === true &&
          keyNames.length === 3 &&
          keyNames[0] === 'ipHash' &&
          keyNames[1] === 'Name' &&
          keyNames[2] === 'searchDateKey';

        if (isCorrectUniqueIndex) {
          return false;
        }

        return index.unique === true;
      })
      .map((index) => index.name)
      .filter((indexName): indexName is string => Boolean(indexName));

    for (const indexName of legacyUniqueIndexNames) {
      await this.characterSearchModel.collection.dropIndex(indexName);
      this.logger.warn(`Dropped legacy character_searches index: ${indexName}`);
    }

    await this.characterSearchModel.collection.createIndex(
      { ipHash: 1, Name: 1, searchDateKey: 1 },
      {
        unique: true,
        name: 'ipHash_1_Name_1_searchDateKey_1',
        partialFilterExpression: {
          ipHash: { $exists: true },
          searchDateKey: { $exists: true },
        },
      },
    );
  }

  private async removeDuplicateSearchesByIpCharacterAndDate() {
    const duplicateGroups = await this.characterSearchModel
      .aggregate<{
        _id: { ipHash: string; Name: string; searchDateKey: string };
        documentIds: string[];
        count: number;
      }>([
        {
          $match: {
            ipHash: { $exists: true, $ne: null },
            searchDateKey: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              ipHash: '$ipHash',
              Name: '$Name',
              searchDateKey: '$searchDateKey',
            },
            documentIds: { $push: { $toString: '$_id' } },
            count: { $sum: 1 },
          },
        },
        {
          $match: {
            count: { $gt: 1 },
          },
        },
      ])
      .exec();

    if (duplicateGroups.length === 0) {
      return;
    }

    const duplicateIdsToDelete = duplicateGroups.flatMap((group) =>
      group.documentIds.slice(1),
    );

    if (duplicateIdsToDelete.length === 0) {
      return;
    }

    const deleteResult = await this.characterSearchModel.deleteMany({
      _id: { $in: duplicateIdsToDelete },
    });

    this.logger.warn(
      `Removed ${deleteResult.deletedCount ?? 0} duplicate character_searches rows for ipHash+Name+searchDateKey uniqueness`,
    );
  }

  private isDuplicateKeyError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
