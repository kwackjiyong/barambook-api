import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 호패 검색 토큰.
 *
 * `/tag?name=X` 페이지를 서버에서 그릴 때 프론트(barambook)가 이름 X에 묶인 토큰을 찍어 HTML에
 * 심고, 검색 API는 그 토큰이 있어야 응답한다. 토큰이 **이름에 묶여 있어서** 한 번 받은 토큰을
 * 다른 이름 검색에 돌려 쓸 수 없다. 수집기는 이름마다 페이지를 한 번씩 더 받아야 하고,
 * API 주소만 알아서는 아무것도 못 한다.
 *
 * 형식: `base64url(JSON{ n: 이름, exp: 만료(초) })` + '.' + `base64url(HMAC-SHA256)`
 * 비밀키는 프론트와 같은 값을 써야 한다. 비공개 레포라 기본값을 코드에 두고
 * `HOPAE_TOKEN_SECRET` 환경변수로 덮어쓴다(visit-state 의 GA 키와 같은 방식).
 */
const DEFAULT_SECRET =
  '080e27d45757dcffa86ee296a56c0b4daf2e7431c69d1183bf8f865f32792823';

export const HOPAE_TOKEN_HEADER = 'x-hopae-token';

export function hopaeTokenSecret(): string {
  return process.env.HOPAE_TOKEN_SECRET || DEFAULT_SECRET;
}

interface HopaeTokenPayload {
  n: string;
  exp: number;
}

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(encodedPayload).digest();
}

/** 테스트와 프론트 구현 대조용. 실제 발급은 프론트(barambook)가 한다. */
export function mintHopaeToken(
  name: string,
  expiresAt: number,
  secret = hopaeTokenSecret(),
): string {
  const payload: HopaeTokenPayload = { n: name, exp: expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, secret).toString('base64url')}`;
}

export type HopaeTokenCheck =
  | 'ok'
  /** 헤더 자체가 없다. API 주소만 알고 두드리는 수집기가 여기 걸린다. */
  | 'missing'
  /** 형식이 틀리거나 서명이 다르다. 위조 시도. */
  | 'invalid'
  /** 서명은 맞지만 유효 시간이 지났다. 페이지를 오래 열어 둔 정상 사용자일 수 있다. */
  | 'expired'
  /** 서명은 맞지만 다른 이름용 토큰이다. 한 토큰으로 여러 이름을 돌리는 수집기. */
  | 'mismatch';

/**
 * 토큰이 `name` 에 대해 지금 유효한지와, 아니라면 왜 아닌지.
 * 사유는 거부 기록에만 남기고 응답에는 담지 않는다.
 */
export function checkHopaeToken(
  token: string | undefined,
  name: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret = hopaeTokenSecret(),
): HopaeTokenCheck {
  if (!token) return 'missing';

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return 'invalid';

  const encoded = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = sign(encoded, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return 'invalid';
  }

  let payload: HopaeTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as HopaeTokenPayload;
  } catch {
    return 'invalid';
  }

  if (typeof payload?.n !== 'string' || typeof payload?.exp !== 'number') {
    return 'invalid';
  }
  if (payload.exp <= nowSeconds) return 'expired';

  return payload.n === name ? 'ok' : 'mismatch';
}

/** 사유 없이 통과 여부만. */
export function verifyHopaeToken(
  token: string | undefined,
  name: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret = hopaeTokenSecret(),
): boolean {
  return checkHopaeToken(token, name, nowSeconds, secret) === 'ok';
}
