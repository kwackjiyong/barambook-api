import { Injectable } from '@nestjs/common';
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
