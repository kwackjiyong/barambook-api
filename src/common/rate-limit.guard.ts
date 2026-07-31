import {
  HttpException,
  HttpStatus,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RateLimiter } from './rate-limiter';

/**
 * 요청을 보낸 실제 클라이언트 주소.
 *
 * main.ts 가 'trust proxy' 를 켜 두어 `req.ip` 는 X-Forwarded-For 의 **맨 앞** 값이 되는데,
 * 그 자리는 클라이언트가 직접 써서 보낼 수 있다. 그대로 쓰면 헤더만 바꿔 가며
 * 매 요청을 새 IP로 위장할 수 있어 제한이 아무 의미가 없다.
 * 그래서 신뢰하는 프록시가 덧붙인 **뒤쪽** 값을 쓴다.
 * 프록시가 둘 이상 겹쳐 있으면(예: CloudFront + nginx) TRUSTED_PROXY_HOPS 로 알려 준다.
 */
export function clientIpOf(request: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
  const chain = request.ips;
  if (chain.length === 0) {
    return request.socket.remoteAddress ?? 'unknown';
  }
  return chain[Math.max(0, chain.length - hops)] ?? 'unknown';
}

/**
 * IP당 요청 속도를 묶는 가드.
 *
 * 데코레이터 인자로 한 번만 평가되므로 라우트마다 버킷이 따로 생긴다.
 * 비싼 엔드포인트일수록 낮은 값을 준다.
 */
export function rateLimit(ratePerSecond: number, burst: number): CanActivate {
  const limiter = new RateLimiter(ratePerSecond, burst);

  return {
    canActivate(context: ExecutionContext): boolean {
      const http = context.switchToHttp();
      const { allowed, retryAfterSeconds } = limiter.consume(
        clientIpOf(http.getRequest<Request>()),
      );

      if (!allowed) {
        http
          .getResponse<Response>()
          .setHeader('Retry-After', String(retryAfterSeconds));
        throw new HttpException(
          '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    },
  };
}
