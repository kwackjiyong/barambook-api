import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { AuthProvider, Member } from './member.schema';
import { resolveGrade } from './grade';
import {
  fetchMverseProfileByCode,
  getMverseBackgroundById,
  isSameMverseProfileName,
  MverseBackground,
  pickMverseBackgroundChallenge,
  sanitizeMverseProfileCode,
} from './mverse-profile';

export interface SsoProfile {
  provider: AuthProvider;
  providerId: string;
  nickname: string;
  email?: string;
  discordId?: string;
}

// 배경 변경 챌린지 시작 응답. 사용자에게 "이 배경으로 바꾸라"고 안내한다.
export interface MaplestoryWorldVerificationChallenge {
  profileName: string;
  profileCode: string;
  avatarImageUrl?: string;
  currentBackground: {
    backgroundId: number;
    title?: string;
  };
  challenge: MverseBackground;
  expiresInMinutes: number;
}

export interface AuthenticatedSession {
  sessionToken: string;
  member: Member;
}

export interface MemberPointSummary {
  point: number;
  grade: ReturnType<typeof resolveGrade>;
  lastAttendanceDate?: string;
  canCheckIn: boolean;
}

export interface AttendanceResult extends MemberPointSummary {
  awarded: boolean;
  awardedPoint: number;
}

// 닉네임 변경 주기 제한: 마지막 변경으로부터 7일
const NICKNAME_CHANGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// 거래 시 메월 닉네임 재검증 주기. 이 시간 안에 통과한 계정은 다시 조회하지 않는다.
const MVERSE_RECHECK_INTERVAL_MS = 10 * 60 * 1000;
// 배경 변경 챌린지 유효시간. 이 안에 배경을 바꾸고 저장해야 한다.
const MVERSE_CHALLENGE_TTL_MS = 30 * 60 * 1000;
export const ATTENDANCE_POINT = 500;

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
        point: 1,
        lastAttendanceDate: 1,
        renderCharacter: 1,
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

  // 대표 캐릭터 이미지 응답용: 저장된 렌더 파라미터만 조회
  async findRenderCharacter(
    accountId: string,
  ): Promise<Member['renderCharacter'] | null> {
    const member = await this.memberModel
      .findOne({ accountId })
      .select({ renderCharacter: 1 })
      .lean()
      .exec();

    return member?.renderCharacter ?? null;
  }

  // 하트비트: 사이트 마지막 활동 시각 갱신
  async touchLastActive(accountId: string): Promise<void> {
    await this.memberModel
      .updateOne({ accountId }, { $set: { lastActiveAt: new Date() } })
      .exec();
  }

  getPointSummary(member: Member): MemberPointSummary {
    const point = Math.max(0, Math.floor(Number(member.point) || 0));
    const lastAttendanceDate = member.lastAttendanceDate;

    return {
      point,
      grade: resolveGrade(point, member.isOperator === true),
      lastAttendanceDate,
      canCheckIn: lastAttendanceDate !== this.getKoreanDateKey(),
    };
  }

  async addPoints(accountId: string, amount: number): Promise<number> {
    const normalizedAmount = Math.max(0, Math.floor(amount));

    if (normalizedAmount === 0) {
      const member = await this.memberModel
        .findOne({ accountId })
        .select({ point: 1 })
        .lean()
        .exec();
      return Math.max(0, Math.floor(Number(member?.point) || 0));
    }

    const member = await this.memberModel
      .findOneAndUpdate(
        { accountId },
        { $inc: { point: normalizedAmount } },
        { new: true },
      )
      .select({ point: 1 })
      .exec();

    return Math.max(0, Math.floor(Number(member?.point) || 0));
  }

  async addDailyLimitedTradeCompletionPoints(
    accountId: string,
    amount: number,
    dailyLimit: number,
  ): Promise<{ awarded: boolean; point: number }> {
    const normalizedAmount = Math.max(0, Math.floor(amount));
    const normalizedLimit = Math.max(1, Math.floor(dailyLimit));
    const today = this.getKoreanDateKey();

    const member = await this.memberModel
      .findOneAndUpdate(
        {
          accountId,
          $or: [
            { tradeCompletionPointDate: { $ne: today } },
            { tradeCompletionPointCount: { $lt: normalizedLimit } },
          ],
        },
        [
          {
            $set: {
              point: {
                $add: [{ $ifNull: ['$point', 0] }, normalizedAmount],
              },
              tradeCompletionPointDate: today,
              tradeCompletionPointCount: {
                $cond: [
                  { $eq: ['$tradeCompletionPointDate', today] },
                  {
                    $add: [
                      { $ifNull: ['$tradeCompletionPointCount', 0] },
                      1,
                    ],
                  },
                  1,
                ],
              },
            },
          },
        ],
        { new: true },
      )
      .select({ point: 1 })
      .exec();

    if (member) {
      return {
        awarded: true,
        point: Math.max(0, Math.floor(Number(member.point) || 0)),
      };
    }

    const current = await this.memberModel
      .findOne({ accountId })
      .select({ point: 1 })
      .lean()
      .exec();

    return {
      awarded: false,
      point: Math.max(0, Math.floor(Number(current?.point) || 0)),
    };
  }

  async checkAttendance(member: Member): Promise<AttendanceResult> {
    const today = this.getKoreanDateKey();
    const updated = await this.memberModel
      .findOneAndUpdate(
        {
          accountId: member.accountId,
          lastAttendanceDate: { $ne: today },
        },
        {
          $set: { lastAttendanceDate: today },
          $inc: { point: ATTENDANCE_POINT },
        },
        { new: true },
      )
      .select({
        accountId: 1,
        point: 1,
        lastAttendanceDate: 1,
        isOperator: 1,
      })
      .exec();

    if (updated) {
      return {
        ...this.getPointSummary(updated),
        awarded: true,
        awardedPoint: ATTENDANCE_POINT,
      };
    }

    const current = await this.memberModel
      .findOne({ accountId: member.accountId })
      .select({
        accountId: 1,
        point: 1,
        lastAttendanceDate: 1,
        isOperator: 1,
      })
      .exec();
    const summary = this.getPointSummary(current ?? member);

    return {
      ...summary,
      awarded: false,
      awardedPoint: 0,
    };
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

  /**
   * 메월 계정 소유 검증 1단계: 배경 변경 챌린지 발급.
   * 현재 배경을 조회해 그와 다른 배경을 서버가 골라 저장해 두고 사용자에게 안내한다.
   * (챌린지를 서버가 정하므로 클라이언트가 임의 배경으로 통과시킬 수 없다)
   */
  async startMaplestoryWorldVerification(
    member: Member,
    maplestoryWorldId: string,
    profileName: string,
  ): Promise<MaplestoryWorldVerificationChallenge> {
    const next = sanitizeMverseProfileCode(maplestoryWorldId);
    const inputName = profileName.trim();

    if (!inputName) {
      throw new BadRequestException('메이플스토리월드 닉네임을 입력하세요.');
    }

    const profile = await fetchMverseProfileByCode(next);

    if (!profile) {
      throw new BadRequestException(
        '메이플스토리월드 프로필을 찾지 못했습니다. 닉네임#태그를 확인하세요.',
      );
    }

    if (!isSameMverseProfileName(inputName, profile.profileName)) {
      throw new BadRequestException(
        '입력한 닉네임과 조회된 프로필명이 다릅니다. 닉네임#태그를 확인하세요.',
      );
    }

    if (profile.backgroundId == null) {
      throw new BadRequestException(
        '메이플스토리월드 프로필 배경 정보를 확인할 수 없습니다. 잠시 후 다시 시도하세요.',
      );
    }

    await this.assertMverseProfileNotTaken(next, member.accountId);

    const challenge = pickMverseBackgroundChallenge(profile.backgroundId);

    await this.memberModel
      .updateOne(
        { accountId: member.accountId },
        {
          $set: {
            maplestoryWorldChallenge: {
              profileCode: next,
              profileName: profile.profileName,
              backgroundId: challenge.backgroundId,
              requestedAt: new Date(),
            },
          },
        },
      )
      .exec();

    return {
      profileName: profile.profileName,
      profileCode: profile.profileCode,
      avatarImageUrl: profile.avatarImageUrl,
      currentBackground: {
        backgroundId: profile.backgroundId,
        title:
          getMverseBackgroundById(profile.backgroundId)?.title ??
          profile.backgroundTitle,
      },
      challenge,
      expiresInMinutes: MVERSE_CHALLENGE_TTL_MS / (60 * 1000),
    };
  }

  /**
   * 메월 계정 소유 검증 2단계: 배경 변경 확인 후 인증 완료.
   * 서버가 발급해 둔 챌린지 배경으로 실제로 변경되었는지 재조회로 검증한다.
   */
  async updateMaplestoryWorldId(
    member: Member,
    maplestoryWorldId: string,
    profileName: string,
  ): Promise<Member> {
    const next = sanitizeMverseProfileCode(maplestoryWorldId);
    const inputName = profileName.trim();

    if (!inputName) {
      throw new BadRequestException('메이플스토리월드 닉네임을 입력하세요.');
    }

    const stored = await this.memberModel
      .findOne({ accountId: member.accountId })
      .select({ maplestoryWorldChallenge: 1 })
      .exec();
    const challenge = stored?.maplestoryWorldChallenge;

    if (
      !challenge ||
      challenge.profileCode !== next ||
      !isSameMverseProfileName(challenge.profileName, inputName)
    ) {
      throw new BadRequestException(
        '배경 변경 인증이 시작되지 않았습니다. 프로필 확인부터 진행하세요.',
      );
    }

    if (
      Date.now() - new Date(challenge.requestedAt).getTime() >
      MVERSE_CHALLENGE_TTL_MS
    ) {
      await this.clearMaplestoryWorldChallenge(member.accountId);
      throw new BadRequestException(
        '배경 변경 인증 유효시간(30분)이 지났습니다. 프로필 확인부터 다시 진행하세요.',
      );
    }

    const profile = await fetchMverseProfileByCode(next);

    if (!profile) {
      throw new BadRequestException(
        '메이플스토리월드 프로필을 다시 확인하지 못했습니다.',
      );
    }

    if (!isSameMverseProfileName(profile.profileName, inputName)) {
      await this.clearMaplestoryWorldChallenge(member.accountId);
      throw new BadRequestException(
        '프로필 닉네임이 변경되었습니다. 프로필 확인부터 다시 진행하세요.',
      );
    }

    if (profile.backgroundId == null) {
      throw new BadRequestException(
        '메이플스토리월드 프로필 배경 정보를 확인할 수 없습니다. 잠시 후 다시 시도하세요.',
      );
    }

    if (profile.backgroundId !== challenge.backgroundId) {
      const target = getMverseBackgroundById(challenge.backgroundId);
      const current = getMverseBackgroundById(profile.backgroundId);

      throw new BadRequestException(
        `아직 지정한 배경(${target?.title ?? `#${challenge.backgroundId}`})으로 변경되지 않았습니다. 현재 배경: ${
          current?.title ?? `#${profile.backgroundId}`
        }`,
      );
    }

    await this.assertMverseProfileNotTaken(next, member.accountId);

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
          $unset: { maplestoryWorldChallenge: 1 },
        },
      )
      .exec();

    member.maplestoryWorldId = next;
    member.maplestoryWorldProfileName = profile.profileName;
    member.maplestoryWorldVerifiedAt = verifiedAt;
    this.mverseRecheckPassedAt.set(member.accountId, Date.now());
    return member;
  }

  // 같은 메월 프로필을 여러 계정이 인증하지 못하게 막는다.
  private async assertMverseProfileNotTaken(
    profileCode: string,
    accountId: string,
  ): Promise<void> {
    const duplicate = await this.memberModel
      .findOne({
        maplestoryWorldId: profileCode,
        accountId: { $ne: accountId },
      })
      .select({ _id: 1 })
      .exec();

    if (duplicate) {
      throw new BadRequestException(
        '이미 다른 계정에 인증된 메이플스토리월드 프로필입니다.',
      );
    }
  }

  private async clearMaplestoryWorldChallenge(
    accountId: string,
  ): Promise<void> {
    await this.memberModel
      .updateOne({ accountId }, { $unset: { maplestoryWorldChallenge: 1 } })
      .exec();
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

  // 의상실 대표 캐릭터 저장. updatedAt은 캐릭터 이미지 캐시 무효화 기준이 된다.
  async updateRenderCharacter(
    member: Member,
    request: NonNullable<Member['renderCharacter']>['request'],
    input?: Record<string, unknown>,
  ): Promise<Member> {
    const renderCharacter: Member['renderCharacter'] = {
      request,
      input,
      updatedAt: new Date(),
    };

    await this.memberModel
      .updateOne({ accountId: member.accountId }, { $set: { renderCharacter } })
      .exec();

    member.renderCharacter = renderCharacter;
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

    const verified = await this.refreshMverseVerification(member);

    if (!verified) {
      throw new BadRequestException(
        '메이플스토리월드 닉네임이 변경되어 재인증이 필요합니다. 내 정보에서 다시 인증하세요.',
      );
    }
  }

  /**
   * 메월 인증을 막지 않고(throw 없이) 현재 인증 상태만 돌려준다.
   * 메월 인증은 거래소 선택사항이라 미인증이어도 거래를 진행하되,
   * 인증된 계정은 주기적으로 프로필을 재조회해 닉네임이 바뀌었으면
   * 인증을 해제(verifiedAt $unset)하고 false를 반환한다.
   * @returns 현재 인증된 계정이면 true
   */
  async refreshMverseVerification(member: Member): Promise<boolean> {
    if (
      !member.maplestoryWorldId ||
      !member.maplestoryWorldProfileName ||
      !member.maplestoryWorldVerifiedAt
    ) {
      return false;
    }

    const passedAt = this.mverseRecheckPassedAt.get(member.accountId);

    if (passedAt != null && Date.now() - passedAt < MVERSE_RECHECK_INTERVAL_MS) {
      return true;
    }

    let profile: Awaited<ReturnType<typeof fetchMverseProfileByCode>>;

    try {
      profile = await fetchMverseProfileByCode(member.maplestoryWorldId);
    } catch {
      // 메월 API 장애 시 직전 인증 상태를 그대로 신뢰한다.
      return true;
    }

    // 프로필 응답이 없는 경우도 일시 장애일 수 있어 통과시킨다.
    if (!profile) {
      return true;
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
      member.maplestoryWorldVerifiedAt = undefined;

      return false;
    }

    this.mverseRecheckPassedAt.set(member.accountId, Date.now());

    return true;
  }

  private hashSessionToken(sessionToken: string): string {
    return createHash('sha256').update(sessionToken).digest('hex');
  }

  private getKoreanDateKey(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}
