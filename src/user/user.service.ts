import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { BulkWriteResult } from 'mongodb';
import { User } from './user.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel('users', 'barambook')
    private userModel: Model<User>,
  ) {}
  findUsers(): Promise<User[]> {
    return this.userModel.find();
  }
  async findUserSearchByName(name: string): Promise<User[]> {
    const keyword = (name ?? '').trim();
    if (!keyword || keyword.length < 2) return [];
    // 포함 검색 (대소문자 무시)
    return this.userModel
      .find({ Name: { $regex: keyword, $options: 'i' } })
      .lean()
      .exec();
  }
  async findUserByName(name: string): Promise<User[]> {
    const user = await this.userModel
      .findOne({ Name: name })
      .select({ _id: 0, MSWID: 1, Name: 1 }) // 필요한 것만
      .lean();
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.' + name);
    const users = await this.userModel
      .find({ MSWID: user.MSWID })
      .sort({ Grade: -1 }) // 필요하면 정렬
      .limit(4)
      .lean();
    return users;
  }
  async upsertUsers(userDatas: Array<User>): Promise<BulkWriteResult> {
    return await this.userModel.bulkWrite(
      userDatas.map((r) => ({
        updateOne: {
          filter: { Name: r.Name }, // 유니크 키
          update: { $set: r }, // 덮어쓸 필드
          upsert: true,
        },
      })),
    );
  }
}
