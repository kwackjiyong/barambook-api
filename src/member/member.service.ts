import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { AuthProvider, Member } from './member.schema';
import {
  fetchMverseProfileByCode,
  isSameMverseProfileName,
  sanitizeMverseProfileCode,
} from './mverse-profile';

export interface SsoProfile {
  provider: AuthProvider;
  providerId: string;
  nickname: string;
  email?: string;
  discordId?: string;
}

export interface MaplestoryWorldVerificationInput {
  profileName: string;
  backgroundId?: number;
}

export interface AuthenticatedSession {
  sessionToken: string;
  member: Member;
}

// 닉네임 변경 주기 제한: 마지막 변경으로부터 7일
const NICKNAME_CHANGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// 거래 시 메월 닉네임 재검증 주기. 이 시간 안에 통과한 계정은 다시 조회하지 않는다.
const MVERSE_RECHECK_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class MemberService {
  // 메월 닉네임 재검증 통과 시각 (accountId 기준 인메모리 캐시)
  private readonly mverseRecheckPassedAt = new Map<string, number>();

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
    const accountKey =
      `${profile.provider}:${profile.providerId}`.toLowerCase();
    const email = profile.email?.toLowerCase();

    return operators.has(accountKey) || (email != null && operators.has(email));
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
        maplestoryWorldProfileName: 1,
        maplestoryWorldVerifiedAt: 1,
        baramNickname: 1,
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

  // 거래 게시자 공개 프로필(닉네임/가입일 등) 조회용
  async findByAccountId(accountId: string): Promise<Member | null> {
    return this.memberModel
      .findOne({ accountId })
      .select({
        accountId: 1,
        nickname: 1,
        maplestoryWorldId: 1,
        maplestoryWorldProfileName: 1,
        baramNickname: 1,
        createdAt: 1,
        lastActiveAt: 1,
      })
      .exec();
  }

  // 하트비트: 사이트 마지막 활동 시각 갱신
  async touchLastActive(accountId: string): Promise<void> {
    await this.memberModel
      .updateOne({ accountId }, { $set: { lastActiveAt: new Date() } })
      .exec();
  }

  // 거래소 활동 배지용: 게시자 accountId 목록의 lastActiveAt 일괄 조회
  async findLastActiveByAccountIds(
    accountIds: string[],
  ): Promise<Map<string, Date>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const members = await this.memberModel
      .find({ accountId: { $in: accountIds } })
      .select({ accountId: 1, lastActiveAt: 1 })
      .exec();

    const lastActiveByAccountId = new Map<string, Date>();

    for (const member of members) {
      if (member.lastActiveAt != null) {
        lastActiveByAccountId.set(member.accountId, member.lastActiveAt);
      }
    }

    return lastActiveByAccountId;
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
    verification: MaplestoryWorldVerificationInput,
  ): Promise<Member> {
    const next = sanitizeMverseProfileCode(maplestoryWorldId);
    const profileName = verification.profileName.trim();

    if (!profileName) {
      throw new BadRequestException('메이플스토리월드 닉네임을 입력하세요.');
    }

    const profile = await fetchMverseProfileByCode(next);

    if (!profile) {
      throw new BadRequestException(
        '메이플스토리월드 프로필을 찾지 못했습니다.',
      );
    }

    if (sanitizeMverseProfileCode(profile.profileCode) !== next) {
      throw new BadRequestException(
        '메이플스토리월드 프로필 태그가 일치하지 않습니다.',
      );
    }

    if (!isSameMverseProfileName(profileName, profile.profileName)) {
      throw new BadRequestException(
        '메이플스토리월드 닉네임이 일치하지 않습니다.',
      );
    }

    if (verification.backgroundId != null) {
      if (profile.backgroundId == null) {
        throw new BadRequestException(
          '메이플스토리월드 프로필 배경 정보를 확인할 수 없습니다.',
        );
      }

      if (profile.backgroundId !== verification.backgroundId) {
        throw new BadRequestException(
          '메이플스토리월드 프로필 배경 변경이 확인되지 않았습니다.',
        );
      }
    }

    const duplicate = await this.memberModel
      .findOne({
        maplestoryWorldId: next,
        accountId: { $ne: member.accountId },
      })
      .select({ _id: 1 })
      .exec();

    if (duplicate) {
      throw new BadRequestException(
        '이미 다른 계정에 인증된 메이플스토리월드 프로필입니다.',
      );
    }

    const verifiedAt = new Date();

    await this.memberModel
      .updateOne(
        { accountId: member.accountId },
        {
          $set: {
            maplestoryWorldId: next,
            maplestoryWorldProfileName: profile.profileName,
            maplestoryWorldVerifiedAt: verifiedAt,
          },
        },
      )
      .exec();

    member.maplestoryWorldId = next;
    member.maplestoryWorldProfileName = profile.profileName;
    member.maplestoryWorldVerifiedAt = verifiedAt;
    this.mverseRecheckPassedAt.set(member.accountId, Date.now());
    return member;
  }

  async updateBaramNickname(
    member: Member,
    baramNickname: string,
  ): Promise<Member> {
    const next = baramNickname.trim();

    if (!next) {
      throw new BadRequestException('바람의나라 닉네임을 입력하세요.');
    }

    await this.memberModel
      .updateOne(
        { accountId: member.accountId },
        { $set: { baramNickname: next } },
      )
      .exec();

    member.baramNickname = next;
    return member;
  }

  /**
   * 거래소 이용 시 메월 인증 상태를 검사한다.
   * 인증되지 않았으면 거부하고, 인증된 계정은 주기적으로 메월 프로필을
   * 다시 조회해 닉네임이 바뀌었으면 인증을 해제하고 재인증을 요구한다.
   */
  async assertVerifiedMverseProfile(member: Member): Promise<void> {
    if (
      !member.maplestoryWorldId ||
      !member.maplestoryWorldProfileName ||
      !member.maplestoryWorldVerifiedAt
    ) {
      throw new BadRequestException(
        '거래소 이용을 위해 내 정보에서 메이플스토리월드 프로필 인증을 먼저 완료하세요.',
      );
    }

    const passedAt = this.mverseRecheckPassedAt.get(member.accountId);

    if (
      passedAt != null &&
      Date.now() - passedAt < MVERSE_RECHECK_INTERVAL_MS
    ) {
      return;
    }

    let profile: Awaited<ReturnType<typeof fetchMverseProfileByCode>>;

    try {
      profile = await fetchMverseProfileByCode(member.maplestoryWorldId);
    } catch {
      // 메월 API 장애가 거래를 막지 않도록 조회 실패는 통과시킨다.
      return;
    }

    // 프로필 응답이 없는 경우도 일시 장애일 수 있어 통과시킨다.
    if (!profile) {
      return;
    }

    if (
      !isSameMverseProfileName(
        profile.profileName,
        member.maplestoryWorldProfileName,
      )
    ) {
      await this.memberModel
        .updateOne(
          { accountId: member.accountId },
          { $unset: { maplestoryWorldVerifiedAt: 1 } },
        )
        .exec();
      this.mverseRecheckPassedAt.delete(member.accountId);

      throw new BadRequestException(
        '메이플스토리월드 닉네임이 변경되어 재인증이 필요합니다. 내 정보에서 다시 인증하세요.',
      );
    }

    this.mverseRecheckPassedAt.set(member.accountId, Date.now());
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }
}
