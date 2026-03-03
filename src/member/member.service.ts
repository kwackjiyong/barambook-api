import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { UpdateCharacterVisibilityDto } from './dto/update-character-visibility.dto';
import { UpdateRepresentativeCharacterDto } from './dto/update-representative-character.dto';
import { CharacterVisibility } from './character-visibility.schema';
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
    @InjectModel('character_visibilities', 'barambook')
    private readonly characterVisibilityModel: Model<CharacterVisibility>,
  ) {}

  async signUp(dto: SignUpDto) {
    const name = dto.Name.trim();
    const accountId = name;
    const password = dto.password.trim();
    const mswid = dto.MSWID.trim();

    const verifiedUser = await this.userModel
      .findOne({ MSWID: mswid, Name: name })
      .select({ _id: 1 })
      .lean()
      .exec();

    if (!verifiedUser) {
      throw new ForbiddenException(
        '캐릭터 정보가 일치하지 않아 계정을 생성할 수 없습니다.',
      );
    }

    const existingAccount = await this.memberModel
      .exists({ accountId })
      .lean()
      .exec();

    if (existingAccount) {
      throw new ConflictException('이미 사용 중인 아이디입니다.');
    }

    const existingMember = await this.memberModel
      .exists({ MSWID: mswid })
      .lean()
      .exec();

    if (existingMember) {
      throw new ConflictException('이미 가입한 사용자입니다.');
    }

    const createdMember = await this.memberModel.create({
      accountId,
      passwordHash: await bcrypt.hash(password, 12),
      MSWID: mswid,
      verifiedAt: new Date(),
      representativeCharacterName: name,
    });

    return {
      id: createdMember.id,
      accountId: createdMember.accountId,
      verified: true,
      createdAt: createdMember.createdAt,
    };
  }

  async login(dto: LoginDto) {
    const name = dto.Name.trim();
    const password = dto.password.trim();

    const member = await this.memberModel.findOne({ accountId: name }).exec();

    if (!member) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const passwordMatched = await bcrypt.compare(password, member.passwordHash);

    if (!passwordMatched) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
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
    const [characters, hiddenCharacters] = await Promise.all([
      this.userModel
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
        .exec(),
      this.characterVisibilityModel
        .find({
          MSWID: member.MSWID,
          isHidden: true,
        })
        .select({ _id: 0, Name: 1 })
        .lean()
        .exec(),
    ]);

    const hiddenCharacterNames = new Set(
      hiddenCharacters.map((character) => character.Name),
    );

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
        isHidden: hiddenCharacterNames.has(character.Name),
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
      throw new ForbiddenException(
        '해당 캐릭터는 현재 계정에 속한 캐릭터가 아닙니다.',
      );
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

  async updateCharacterVisibility(
    member: Member,
    dto: UpdateCharacterVisibilityDto,
  ) {
    const characterName = dto.Name.trim();

    const targetCharacter = await this.userModel
      .findOne({
        MSWID: member.MSWID,
        Name: characterName,
      })
      .select({ _id: 1, Name: 1 })
      .lean()
      .exec();

    if (!targetCharacter) {
      throw new ForbiddenException(
        '해당 캐릭터는 현재 계정에 속한 캐릭터가 아닙니다.',
      );
    }

    if (dto.isHidden) {
      await this.characterVisibilityModel
        .updateOne(
          {
            MSWID: member.MSWID,
            Name: characterName,
          },
          {
            $set: {
              MSWID: member.MSWID,
              Name: characterName,
              isHidden: true,
            },
          },
          {
            upsert: true,
          },
        )
        .exec();
    } else {
      await this.characterVisibilityModel
        .deleteOne({
          MSWID: member.MSWID,
          Name: characterName,
        })
        .exec();
    }

    return {
      accountId: member.accountId,
      name: characterName,
      isHidden: dto.isHidden,
    };
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }
}
