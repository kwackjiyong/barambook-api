import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { AuthProvider, Member } from './member.schema';

export interface SsoProfile {
  provider: AuthProvider;
  providerId: string;
  nickname: string;
  email?: string;
}

export interface AuthenticatedSession {
  sessionToken: string;
  member: Member;
}

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

    await this.memberModel
      .updateOne({ accountId: member.accountId }, { $set: { nickname: next } })
      .exec();

    member.nickname = next;
    return member;
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }
}
