import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * OAuth 시작 시점에 `?next=/경로` 쿼리를 단기 쿠키로 저장해두고,
 * 콜백 처리 후 해당 경로로 되돌려보내기 위한 가드.
 * 오픈 리다이렉트를 막기 위해 내부 절대경로(`/`로 시작, `//` 제외)만 허용한다.
 */
@Injectable()
export class SaveNextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    const next = SaveNextGuard.sanitizeNext(req.query?.next);

    if (next) {
      res.cookie('auth_next', next, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 10 * 60 * 1000,
      });
    }

    return true;
  }

  static sanitizeNext(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    if (!value.startsWith('/') || value.startsWith('//')) {
      return null;
    }

    return value;
  }
}
