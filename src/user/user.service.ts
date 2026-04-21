import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterLike } from './character-like.schema';

@Injectable()
export class UserService {
  constructor(
    @InjectModel('character_likes', 'barambook')
    private readonly characterLikeModel: Model<CharacterLike>,
  ) {}

  async getLikeCountForName(name: string): Promise<number> {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return 0;
    }

    return this.characterLikeModel.countDocuments({ Name: trimmedName }).exec();
  }
}
