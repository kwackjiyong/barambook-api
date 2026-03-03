import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { BulkWriteResult } from 'mongodb';
import { Model } from 'mongoose';
import { CharacterVisibility } from '../member/character-visibility.schema';
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
  isHidden: boolean;
};

@Injectable()
export class UserService {
  constructor(
    @InjectModel('users', 'barambook')
    private readonly userModel: Model<User>,
    @InjectModel('character_visibilities', 'barambook')
    private readonly characterVisibilityModel: Model<CharacterVisibility>,
  ) {}

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
    const user = await this.userModel
      .findOne({ Name: name })
      .select({ _id: 0, MSWID: 1, Name: 1 })
      .lean()
      .exec();

    if (!user) {
      throw new NotFoundException(`User not found. ${name}`);
    }

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

    const hiddenCharacterNames = new Set(
      hiddenCharacters.map((character) => character.Name),
    );

    return users.map((character) => {
      const isHidden = hiddenCharacterNames.has(character.Name);
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
          isHidden: false,
        };
      }

      return {
        Name: 'Hidden Character',
        ClanName: null,
        Class: character.Class,
        Nation: character.Nation,
        Level: character.Level,
        Grade: character.Grade,
        MaxHP: null,
        MaxMP: null,
        isHidden: true,
      };
    });
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
}
