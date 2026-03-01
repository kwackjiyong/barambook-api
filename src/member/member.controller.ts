import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { Member } from './member.schema';
import { MemberSessionGuard } from './member-session.guard';
import { SignUpDto } from './dto/sign-up.dto';
import { MemberService } from './member.service';
import { UpdateRepresentativeCharacterDto } from './dto/update-representative-character.dto';

type AuthenticatedRequest = Request & {
  member?: Member;
};

@Controller('members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get('/me')
  @UseGuards(MemberSessionGuard)
  async me(@Req() req: AuthenticatedRequest) {
    const member = req.member as Member;

    return {
      accountId: member.accountId,
      MSWID: member.MSWID,
      verifiedAt: member.verifiedAt,
      representativeCharacterName:
        member.representativeCharacterName ?? member.accountId,
      lastLoginAt: member.lastLoginAt,
      createdAt: member.createdAt,
      authenticated: true,
    };
  }

  @Get('/characters')
  @UseGuards(MemberSessionGuard)
  async getMyCharacters(@Req() req: AuthenticatedRequest) {
    const member = req.member as Member;
    return this.memberService.getMyCharacters(member);
  }

  @Post('/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.memberService.login(dto);

    res.cookie('barambook_session', result.sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    return {
      accountId: result.accountId,
      MSWID: result.MSWID,
      representativeCharacterName: result.representativeCharacterName,
      authenticated: result.authenticated,
      lastLoginAt: result.lastLoginAt,
    };
  }

  @Post('/logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieHeader = req.headers.cookie ?? '';
    const sessionCookie = cookieHeader
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('barambook_session='));

    if (sessionCookie) {
      const [, rawValue = ''] = sessionCookie.split('=');
      await this.memberService.logout(decodeURIComponent(rawValue));
    }

    res.clearCookie('barambook_session', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });

    return {
      authenticated: false,
    };
  }

  @Patch('/representative-character')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async updateRepresentativeCharacter(
    @Req() req: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: UpdateRepresentativeCharacterDto,
  ) {
    const member = req.member as Member;
    return this.memberService.updateRepresentativeCharacter(member, dto);
  }

  @Post('/signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: SignUpDto,
  ) {
    return this.memberService.signUp(dto);
  }
}
