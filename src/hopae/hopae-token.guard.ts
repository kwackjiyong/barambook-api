import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { clientIpOf } from '../common/rate-limit.guard';
import { HopaeDenialService } from './hopae-denial.service';
import { checkHopaeToken, HOPAE_TOKEN_HEADER } from './hopae-token';

/**
 * `/tag?name=X` 페이지를 거쳐 온 검색만 통과시킨다.
 *
 * 가드는 파이프보다 먼저 돌아서 `query.name` 은 아직 검증 전 원본이다.
 * 서비스가 trim 한 이름으로 조회하므로 여기서도 같은 규칙으로 맞춰 대조한다.
 *
 * 막힌 요청은 실제 클라이언트 IP 와 사유를 남겨 운영자 화면(/hopae/denied)에서 본다.
 * 응답의 실패 사유는 하나로 뭉뚱그린다. 어디서 틀렸는지 알려 주면 맞추기 쉬워질 뿐이다.
 */
@Injectable()
export class HopaeTokenGuard implements CanActivate {
  constructor(private readonly denials: HopaeDenialService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const rawName = request.query?.name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    const header = request.headers[HOPAE_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;

    const result = name ? checkHopaeToken(token, name) : 'missing';
    if (result === 'ok') return true;

    this.denials.record({
      ip: clientIpOf(request),
      forwardedFor: joinedForwardedFor(request),
      name,
      reason: result,
      userAgent: headerOf(request, 'user-agent'),
      referer: headerOf(request, 'referer'),
    });

    throw new ForbiddenException(
      '검색 페이지를 새로고침한 뒤 다시 시도해 주세요.',
    );
  }
}

function headerOf(request: Request, key: string): string | undefined {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function joinedForwardedFor(request: Request): string | undefined {
  const chain = request.ips ?? [];
  return chain.length > 0 ? chain.join(', ') : undefined;
}
