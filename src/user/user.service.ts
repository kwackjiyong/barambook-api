import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { CharacterLike } from './character-like.schema';
import { User } from './user.schema';

export interface ChannelFollowUser {
  Name: string;
  encryptedMSWID: string;
}

const CHANNEL_FOLLOW_CRYPTO_SECRET =
  process.env.CHANNEL_FOLLOW_CRYPTO_SECRET ?? 'barambook-channel-follow-v1';

@Injectable()
export class UserService {
  constructor(
    @InjectModel('character_likes', 'barambook')
    private readonly characterLikeModel: Model<CharacterLike>,
    @InjectModel('users', 'barambook')
    private readonly userModel: Model<User>,
  ) {}

  async findChannelFollowUserByName(
    name: string,
  ): Promise<ChannelFollowUser | null> {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return null;
    }

    const user = await this.userModel
      .findOne({
        Name: trimmedName,
        MSWID: { $exists: true, $ne: '' },
      })
      .select({ _id: 0, Name: 1, MSWID: 1 })
      .lean()
      .exec();

    if (!user?.MSWID) {
      return null;
    }

    return {
      Name: user.Name,
      encryptedMSWID: encryptChannelFollowValue(user.MSWID),
    };
  }

  async getLikeCountForName(name: string): Promise<number> {
    const trimmedName = (name ?? '').trim();

    if (!trimmedName) {
      return 0;
    }

    return this.characterLikeModel.countDocuments({ Name: trimmedName }).exec();
  }
}

function encryptChannelFollowValue(value: string): string {
  const key = createHash('sha256').update(CHANNEL_FOLLOW_CRYPTO_SECRET).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map(toBase64Url).join('.');
}

function toBase64Url(value: Buffer): string {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
