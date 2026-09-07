import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { Member } from './member.schema';
import { MemberSessionGuard } from './member-session.guard';

type AuthenticatedRequest = Request & {
  member?: Member;
};

/**
 * 로그인한 회원 중 운영자(OPERATOR_ACCOUNTS 허용목록)만 통과시킨다.
 * 세션 확인은 MemberSessionGuard 에 그대로 맡기고, 그 위에 권한만 한 번 더 본다.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  constructor(private readonly sessionGuard: MemberSessionGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.sessionGuard.canActivate(context);

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.member?.isOperator !== true) {
      throw new ForbiddenException('운영자만 볼 수 있습니다.');
    }

    return true;
  }
}
