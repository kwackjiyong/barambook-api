import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { MemberSessionGuard } from '../member/member-session.guard';
import { Member } from '../member/member.schema';
import { MemberService, SsoProfile } from '../member/member.service';
import { UpdateMaplestoryWorldIdDto } from './dto/update-maplestory-world-id.dto';
import { UpdateNicknameDto } from './dto/update-nickname.dto';
import { SaveNextGuard } from './save-next.guard';

type AuthenticatedRequest = Request & {
  member?: Member;
  user?: SsoProfile;
};

const SESSION_COOKIE = 'barambook_session';
const NEXT_COOKIE = 'auth_next';
// 운영자 표기로 오인될 수 있는 예약 닉네임 (스푸핑 방지)
const RESERVED_NICKNAMES = new Set(['바람비전']);

@Controller('auth')
export class AuthController {
  constructor(private readonly memberService: MemberService) {}

  @Get('/google')
  @UseGuards(SaveNextGuard, AuthGuard('google'))
  googleLogin(): void {
    // AuthGuard가 구글 동의 화면으로 리다이렉트한다.
  }

  @Get('/google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    await this.completeSsoLogin(req, res);
  }

  @Get('/discord')
  @UseGuards(SaveNextGuard, AuthGuard('discord'))
  discordLogin(): void {
    // AuthGuard가 디스코드 동의 화면으로 리다이렉트한다.
  }

  @Get('/discord/callback')
  @UseGuards(AuthGuard('discord'))
  async discordCallback(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    await this.completeSsoLogin(req, res);
  }

  @Get('/me')
  @UseGuards(MemberSessionGuard)
  me(@Req() req: AuthenticatedRequest) {
    const member = req.member as Member;
    return this.serializeMember(member);
  }

  // 사이트 활동 하트비트. 탭이 열려 있는 동안 주기적으로 호출되어
  // 거래소 게시자 활동중/부재중 배지 기준(lastActiveAt)을 갱신한다.
  @Post('/heartbeat')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async heartbeat(@Req() req: AuthenticatedRequest) {
    const member = req.member as Member;
    await this.memberService.touchLastActive(member.accountId);
    return { ok: true };
  }

  @Post('/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionToken = this.readCookie(req, SESSION_COOKIE);

    if (sessionToken) {
      await this.memberService.logout(sessionToken);
    }

    res.clearCookie(SESSION_COOKIE, this.sessionCookieOptions());

    return { authenticated: false };
  }

  @Patch('/nickname')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async updateNickname(
    @Req() req: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: UpdateNicknameDto,
  ) {
    const nickname = dto.nickname.trim();

    if (RESERVED_NICKNAMES.has(nickname)) {
      throw new BadRequestException('사용할 수 없는 닉네임입니다.');
    }

    const member = await this.memberService.updateNickname(
      req.member as Member,
      nickname,
    );

    return this.serializeMember(member);
  }

  @Patch('/maplestory-world-id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async updateMaplestoryWorldId(
    @Req() req: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: UpdateMaplestoryWorldIdDto,
  ) {
    const member = await this.memberService.updateMaplestoryWorldId(
      req.member as Member,
      dto.maplestoryWorldId,
      {
        profileName: dto.profileName,
        backgroundId: dto.backgroundId,
      },
    );

    return this.serializeMember(member);
  }

  private async completeSsoLogin(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    const profile = req.user as SsoProfile;
    const { sessionToken } = await this.memberService.loginWithSso(profile);

    res.cookie(SESSION_COOKIE, sessionToken, this.sessionCookieOptions());

    const next = SaveNextGuard.sanitizeNext(this.readCookie(req, NEXT_COOKIE));
    res.clearCookie(NEXT_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    const frontendUrl = (
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ).replace(/\/$/, '');

    res.redirect(`${frontendUrl}${next ?? '/'}`);
  }

  private serializeMember(member: Member) {
    return {
      accountId: member.accountId,
      provider: member.provider,
      nickname: member.nickname ?? member.accountId,
      email: member.email,
      discordId: member.discordId,
      maplestoryWorldId: member.maplestoryWorldId,
      maplestoryWorldProfileName: member.maplestoryWorldProfileName,
      maplestoryWorldVerifiedAt:
        member.maplestoryWorldVerifiedAt?.toISOString(),
      isOperator: member.isOperator === true,
      authenticated: true,
    };
  }

  private sessionCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  private readCookie(req: Request, name: string): string | null {
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    const cookie = cookieHeader
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${name}=`));

    if (!cookie) {
      return null;
    }

    const [, rawValue = ''] = cookie.split('=');
    return decodeURIComponent(rawValue);
  }
}
