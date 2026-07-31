import {
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

const DEFAULT_HOSTS = [
  'barambook.com',
  'www.barambook.com',
  'localhost',
  '127.0.0.1',
];

function allowedHosts(): string[] {
  const configured = process.env.ALLOWED_ORIGIN_HOSTS;
  if (!configured) return DEFAULT_HOSTS;
  return configured
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 남의 사이트에서 이미지를 그대로 불러다 쓰는 것(핫링크)을 막는 가드.
 *
 * Origin/Referer 가 **있는데 우리 도메인이 아닐 때만** 막는다.
 * 헤더가 없는 요청은 통과시키는데, 이미지 주소를 직접 열어 보거나 메신저에
 * 링크를 붙였을 때 미리보기를 가져가는 봇은 헤더를 안 보내기 때문이다.
 * 헤더를 지우고 긁는 수집기까지 잡자는 것이 아니라(그건 속도 제한 몫),
 * 퍼가서 자기 화면에 띄우는 쪽을 끊는 것이 목적이다.
 */
export const blockHotlink: CanActivate = {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const host =
      hostOf(request.headers.origin) ?? hostOf(request.headers.referer);
    if (host === null) return true;

    const allowed = allowedHosts();
    if (allowed.includes(host)) return true;
    // 서브도메인도 같은 집안으로 본다.
    if (allowed.some((entry) => host.endsWith(`.${entry}`))) return true;

    throw new ForbiddenException('다른 사이트에서는 불러올 수 없습니다.');
  },
};
