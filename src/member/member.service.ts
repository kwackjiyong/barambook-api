import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { AuthProvider, Member } from './member.schema';

export interface SsoProfile {
  provider: AuthProvider;
  providerId: string;
  nickname: string;
  email?: string;
  discordId?: string;
}

export interface AuthenticatedSession {
  sessionToken: string;
  member: Member;
}

// 닉네임 변경 주기 제한: 마지막 변경으로부터 7일
const NICKNAME_CHANGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MemberService {
  constructor(
    @InjectModel('sso_members', 'barambook')
    private readonly memberModel: Model<Member>,
  ) {}

  /**
   * 운영자 허용목록. OPERATOR_ACCOUNTS 환경변수에
   * `google:1234,discord:5678,owner@example.com` 처럼 콤마로 나열한다.
   * 계정의 `${provider}:${providerId}` 또는 이메일과 일치하면 운영자.
   */
  private getOperatorAccounts(): Set<string> {
    return new Set(
      (process.env.OPERATOR_ACCOUNTS ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    );
  }

  private resolveIsOperator(profile: SsoProfile): boolean {
    const operators = this.getOperatorAccounts();
    const accountKey = `${profile.provider}:${profile.providerId}`.toLowerCase();
    const email = profile.email?.toLowerCase();

    return (
      operators.has(accountKey) || (email != null && operators.has(email))
    );
  }

  /**
   * SSO 로그인 시 호출. 제공자/제공자ID로 회원을 찾거나 새로 만들고
   * 세션 토큰을 발급한다. 닉네임은 최초 가입 시에만 제공자 값으로 채우고,
   * 이후에는 사용자가 수정한 값을 보존한다.
   */
  async loginWithSso(profile: SsoProfile): Promise<AuthenticatedSession> {
    const accountId = `${profile.provider}:${profile.providerId}`;
    const isOperator = this.resolveIsOperator(profile);

    let member = await this.memberModel
      .findOne({ provider: profile.provider, providerId: profile.providerId })
      .exec();

    if (!member) {
      member = new this.memberModel({
        accountId,
        provider: profile.provider,
        providerId: profile.providerId,
        nickname: profile.nickname,
        email: profile.email,
        isOperator,
      });
    } else {
      // 이메일/운영자 권한은 매 로그인마다 최신화하되 닉네임은 보존
      member.email = profile.email;
      member.isOperator = isOperator;
    }

    if (profile.discordId) {
      member.discordId = profile.discordId;
    }

    const sessionToken = randomBytes(48).toString('hex');
    member.sessionTokenHash = this.hashSessionToken(sessionToken);
    member.lastLoginAt = new Date();
    await member.save();

    return { sessionToken, member };
  }

  async findAuthenticatedMember(sessionToken: string): Promise<Member> {
    const sessionTokenHash = this.hashSessionToken(sessionToken);

    const member = await this.memberModel
      .findOne({ sessionTokenHash })
      .select({
        accountId: 1,
        provider: 1,
        nickname: 1,
        email: 1,
        discordId: 1,
        maplestoryWorldId: 1,
        isOperator: 1,
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

  async updateNickname(member: Member, nickname: string): Promise<Member> {
    const next = nickname.trim();

    const current = await this.memberModel
      .findOne({ accountId: member.accountId })
      .select({ nickname: 1, nicknameUpdatedAt: 1 })
      .exec();

    // 현재 닉네임과 동일하면 변경 없이 통과 (주기 제한·중복 검사 미적용)
    if (current?.nickname === next) {
      member.nickname = next;
      return member;
    }

    // 1) 변경 주기 제한 (마지막 변경으로부터 7일)
    const lastChanged = current?.nicknameUpdatedAt;
    if (lastChanged) {
      const elapsed = Date.now() - lastChanged.getTime();
      if (elapsed < NICKNAME_CHANGE_INTERVAL_MS) {
        const remainingDays = Math.ceil(
          (NICKNAME_CHANGE_INTERVAL_MS - elapsed) / DAY_MS,
        );
        throw new BadRequestException(
          `닉네임은 7일에 한 번만 변경할 수 있습니다. ${remainingDays}일 후에 다시 변경할 수 있습니다.`,
        );
      }
    }

    // 2) 중복 닉네임 검사 (대소문자 무시, 본인 제외)
    const duplicate = await this.memberModel
      .findOne({ nickname: next, accountId: { $ne: member.accountId } })
      .collation({ locale: 'en', strength: 2 })
      .select({ _id: 1 })
      .exec();

    if (duplicate) {
      throw new BadRequestException('이미 사용 중인 닉네임입니다.');
    }

    const now = new Date();

    await this.memberModel
      .updateOne(
        { accountId: member.accountId },
        { $set: { nickname: next, nicknameUpdatedAt: now } },
      )
      .exec();

    member.nickname = next;
    member.nicknameUpdatedAt = now;
    return member;
  }

  async updateMaplestoryWorldId(
    member: Member,
    maplestoryWorldId: string,
  ): Promise<Member> {
    const next = maplestoryWorldId.trim();

    await this.memberModel
      .updateOne(
        { accountId: member.accountId },
        { $set: { maplestoryWorldId: next } },
      )
      .exec();

    member.maplestoryWorldId = next;
    return member;
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }
}
