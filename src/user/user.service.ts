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
import { CharacterVisibility } from '../member/character-visibility.schema';
import { CharacterLike } from './character-like.schema';
import { CharacterSearch } from './character-search.schema';
import { User } from './user.schema';

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
    @InjectModel('character_visibilities', 'barambook')
    private readonly characterVisibilityModel: Model<CharacterVisibility>,
    @InjectModel('character_likes', 'barambook')
    private readonly characterLikeModel: Model<CharacterLike>,
    @InjectModel('character_searches', 'barambook')
    private readonly characterSearchModel: Model<CharacterSearch>,
  ) {}

  async onModuleInit() {
    await this.ensureCharacterLikeIndexes();
  }

  findUsers(): Promise<User[]> {
    return this.userModel.find();
  }

  async findUserSearchByName(name: string): Promise<User[]> {
    const keyword = (name ?? '').trim();
    if (!keyword || keyword.length < 2) return [];

    return this.userModel
      .find({ Name: { $regex: keyword, $options: 'i' } })
      .lean()
      .exec();
  }

  async findUserByName(name: string): Promise<UserSearchResult[]> {
    const trimmedName = (name ?? '').trim();
    const user = await this.userModel
      .findOne({ Name: trimmedName })
      .select({ _id: 0, MSWID: 1, Name: 1 })
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException(`User not found. ${name}`);
    }

    await this.recordCharacterSearch(user.Name);

    const [users, hiddenCharacters] = await Promise.all([
      this.userModel
        .find({ MSWID: user.MSWID })
        .sort({ Grade: -1, Level: -1, Name: 1 })
        .limit(4)
        .lean()
        .exec(),
      this.characterVisibilityModel
        .find({
          MSWID: user.MSWID,
          isHidden: true,
        })
        .select({ _id: 0, Name: 1 })
        .lean()
        .exec(),
    ]);

    const likeCountsByName = await this.getLikeCountsByNames(
      users.map((character) => character.Name),
    );
    const hiddenCharacterNames = new Set(
      hiddenCharacters.map((character) => character.Name),
    );

    return users.map((character) =>
      this.toUserSearchResult(
        character,
        hiddenCharacterNames.has(character.Name),
        likeCountsByName.get(character.Name) ?? 0,
      ),
    );
  }

  async findSingleUserByName(name: string): Promise<UserSearchResult> {
    const trimmedName = (name ?? '').trim();
    const character = await this.userModel
      .findOne({ Name: trimmedName })
      .lean()
      .exec();

    if (!character) {
      throw new NotFoundException(`User not found. ${name}`);
    }

    await this.recordCharacterSearch(character.Name);

    const [hiddenCharacter, likeCount] = await Promise.all([
      this.characterVisibilityModel
        .findOne({
          MSWID: character.MSWID,
          Name: character.Name,
          isHidden: true,
        })
        .select({ _id: 0, Name: 1 })
        .lean()
        .exec(),
      this.getLikeCountForName(character.Name),
    ]);

    return this.toUserSearchResult(
      character,
      Boolean(hiddenCharacter),
      likeCount,
    );
  }

  async findUsersByClanName(name: string): Promise<UserSearchResult[]> {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return [];
    }

    const users = await this.userModel
      .find({ ClanName: trimmedName })
      .sort({ Grade: -1, Level: -1, Name: 1 })
      .lean()
      .exec();

    if (users.length === 0) {
      return [];
    }

    const hiddenCharacters = await this.characterVisibilityModel
      .find({
        Name: { $in: users.map((character) => character.Name) },
        isHidden: true,
      })
      .select({ _id: 0, Name: 1 })
      .lean()
      .exec();

    const hiddenCharacterNames = new Set(hiddenCharacters.map((character) => character.Name));
    const visibleUsers = users.filter((character) => !hiddenCharacterNames.has(character.Name));
    const likeCountsByName = await this.getLikeCountsByNames(
      visibleUsers.map((character) => character.Name),
    );

    return visibleUsers.map((character) =>
      this.toUserSearchResult(character, false, likeCountsByName.get(character.Name) ?? 0),
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
        throw new ConflictException(
          '같은 IP에서는 하루에 한 번만 인품을 남길 수 있습니다.',
        );
      }

      throw error;
    }

    return {
      name: character.Name,
      likeCount: await this.getLikeCountForName(character.Name),
    };
  }

  async getSearchRanking(limit = 10): Promise<UserLikeRankingItem[]> {
    const rankingRows = await this.characterSearchModel
      .aggregate<{ _id: string; searchCount: number }>([
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
    const [users, hiddenCharacters] = await Promise.all([
      this.userModel
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
        .exec(),
      this.characterVisibilityModel
        .find({
          Name: { $in: names },
          isHidden: true,
        })
        .select({ _id: 0, Name: 1 })
        .lean()
        .exec(),
    ]);

    const userByName = new Map(users.map((user) => [user.Name, user]));
    const hiddenNames = new Set(hiddenCharacters.map((item) => item.Name));

    return rankingRows
      .filter((row) => userByName.has(row._id) && !hiddenNames.has(row._id))
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

  async upsertUsers(userDatas: Array<User>): Promise<BulkWriteResult> {
    return await this.userModel.bulkWrite(
      userDatas.map((record) => ({
        updateOne: {
          filter: { Name: record.Name },
          update: { $set: record },
          upsert: true,
        },
      })),
    );
  }

  private toUserSearchResult(
    character: User,
    isHidden: boolean,
    likeCount: number,
  ): UserSearchResult {
    if (!isHidden) {
      return {
        Name: character.Name,
        ClanName: character.ClanName ?? null,
        Class: character.Class,
        Nation: character.Nation,
        Level: character.Level,
        Grade: character.Grade,
        MaxHP: character.MaxHP,
        MaxMP: character.MaxMP,
        likeCount,
        isHidden: false,
      };
    }

    return {
      Name: '숨김 캐릭터',
      ClanName: null,
      Class: '-',
      Nation: '-',
      Level: 0,
      Grade: 0,
      MaxHP: null,
      MaxMP: null,
      likeCount,
      isHidden: true,
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

  private async recordCharacterSearch(name: string) {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return;
    }

    await this.characterSearchModel.create({
      Name: trimmedName,
    });
  }

  private getLikedDateKey(date = new Date()) {
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

  private isDuplicateKeyError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
