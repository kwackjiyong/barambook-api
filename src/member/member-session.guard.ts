import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Member } from './member.schema';
import { MemberService } from './member.service';

type AuthenticatedRequest = Request & {
  member?: Member;
};

@Injectable()
export class MemberSessionGuard implements CanActivate {
  constructor(private readonly memberService: MemberService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionToken = this.extractSessionToken(req);

    if (!sessionToken) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    const member =
      await this.memberService.findAuthenticatedMember(sessionToken);
    req.member = member;

    return true;
  }

  private extractSessionToken(req: Request): string | null {
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    const cookie = cookieHeader
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('barambook_session='));

    if (!cookie) {
      return null;
    }

    const [, rawValue = ''] = cookie.split('=');
    return decodeURIComponent(rawValue);
  }
}
