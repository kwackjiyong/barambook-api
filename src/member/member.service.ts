import {
  ForbiddenException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import { LoginDto } from './dto/login.dto';
import { UpdateRepresentativeCharacterDto } from './dto/update-representative-character.dto';
import { Member } from './member.schema';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcryptjs') as {
  hash(value: string, saltRounds: number): Promise<string>;
  compare(value: string, encrypted: string): Promise<boolean>;
};

@Injectable()
export class MemberService {
  constructor(
    @InjectModel('members', 'barambook')
    private readonly memberModel: Model<Member>,
    @InjectModel('users', 'barambook')
    private readonly userModel: Model<User>,
  ) {}

  async signUp() {
    throw new GoneException('신규 회원가입은 더 이상 지원하지 않습니다.');
  }

  async login(dto: LoginDto) {
    const name = dto.Name.trim();
    const password = dto.password.trim();

    const member = await this.memberModel.findOne({ accountId: name }).exec();

    if (!member) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const passwordMatched = await bcrypt.compare(password, member.passwordHash);

    if (!passwordMatched) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const sessionToken = randomBytes(48).toString('hex');
    const sessionTokenHash = this.hashSessionToken(sessionToken);
    const lastLoginAt = new Date();

    member.sessionTokenHash = sessionTokenHash;
    member.lastLoginAt = lastLoginAt;
    await member.save();

    return {
      sessionToken,
      accountId: member.accountId,
      representativeCharacterName:
        member.representativeCharacterName ?? member.accountId,
      authenticated: true,
      lastLoginAt,
    };
  }

  async findAuthenticatedMember(sessionToken: string): Promise<Member> {
    const sessionTokenHash = this.hashSessionToken(sessionToken);

    const member = await this.memberModel
      .findOne({ sessionTokenHash })
      .select({
        accountId: 1,
        MSWID: 1,
        verifiedAt: 1,
        representativeCharacterName: 1,
        lastLoginAt: 1,
        createdAt: 1,
      })
      .exec();

    if (!member) {
      throw new UnauthorizedException('유효한 로그인 세션이 아닙니다.');
    }

    return member;
  }

  async logout(sessionToken: string): Promise<void> {
    const sessionTokenHash = this.hashSessionToken(sessionToken);

    await this.memberModel
      .updateOne(
        { sessionTokenHash },
        {
          $unset: { sessionTokenHash: 1 },
        },
      )
      .exec();
  }

  async getMyCharacters(member: Member) {
    const characters = await this.userModel
      .find({ MSWID: member.MSWID })
      .select({
        _id: 0,
        Name: 1,
        ClanName: 1,
        Class: 1,
        Grade: 1,
        Level: 1,
        Nation: 1,
        MaxHP: 1,
        MaxMP: 1,
      })
      .sort({ Grade: -1, Level: -1, Name: 1 })
      .lean()
      .exec();

    return {
      accountId: member.accountId,
      representativeCharacterName:
        member.representativeCharacterName ?? member.accountId,
      characters: characters.map((character) => ({
        name: character.Name,
        clanName: character.ClanName,
        className: character.Class,
        grade: character.Grade,
        level: character.Level,
        nation: character.Nation,
        maxHP: character.MaxHP,
        maxMP: character.MaxMP,
        isRepresentative:
          character.Name ===
          (member.representativeCharacterName ?? member.accountId),
      })),
    };
  }

  async updateRepresentativeCharacter(
    member: Member,
    dto: UpdateRepresentativeCharacterDto,
  ) {
    const nextRepresentativeName = dto.Name.trim();

    const targetCharacter = await this.userModel
      .findOne({
        MSWID: member.MSWID,
        Name: nextRepresentativeName,
      })
      .select({ _id: 1, Name: 1 })
      .lean()
      .exec();

    if (!targetCharacter) {
      throw new ForbiddenException('현재 계정에 연결된 캐릭터만 대표로 설정할 수 있습니다.');
    }

    await this.memberModel
      .updateOne(
        { accountId: member.accountId },
        {
          $set: {
            representativeCharacterName: nextRepresentativeName,
          },
        },
      )
      .exec();

    return {
      accountId: member.accountId,
      representativeCharacterName: nextRepresentativeName,
    };
  }

  async updateCharacterVisibility() {
    throw new GoneException('호패 숨김 처리 기능은 종료되었습니다.');
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }
}
