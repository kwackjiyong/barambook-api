import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import {
  checkHopaeToken,
  mintHopaeToken,
  verifyHopaeToken,
} from './hopae-token';
import { HopaeTokenGuard } from './hopae-token.guard';
import type { HopaeDenialService } from './hopae-denial.service';

const SECRET = 'test-secret';
const NOW = 1_700_000_000;

describe('checkHopaeToken', () => {
  it('accepts a fresh token for the same name', () => {
    const token = mintHopaeToken('홍길동', NOW + 600, SECRET);
    expect(checkHopaeToken(token, '홍길동', NOW, SECRET)).toBe('ok');
    expect(verifyHopaeToken(token, '홍길동', NOW, SECRET)).toBe(true);
  });

  it('names a token minted for another name as mismatch', () => {
    const token = mintHopaeToken('홍길동', NOW + 600, SECRET);
    expect(checkHopaeToken(token, '임꺽정', NOW, SECRET)).toBe('mismatch');
  });

  it('names an expired token as expired', () => {
    const token = mintHopaeToken('홍길동', NOW - 1, SECRET);
    expect(checkHopaeToken(token, '홍길동', NOW, SECRET)).toBe('expired');
  });

  it('names a token signed with another secret as invalid', () => {
    const token = mintHopaeToken('홍길동', NOW + 600, 'other');
    expect(checkHopaeToken(token, '홍길동', NOW, SECRET)).toBe('invalid');
  });

  it('names a payload edited after signing as invalid', () => {
    const token = mintHopaeToken('홍길동', NOW + 600, SECRET);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ n: '임꺽정', exp: NOW + 600 }),
    ).toString('base64url');
    expect(
      checkHopaeToken(`${forged}.${signature}`, '임꺽정', NOW, SECRET),
    ).toBe('invalid');
  });

  it('names a missing header as missing and garbage as invalid, without throwing', () => {
    expect(checkHopaeToken(undefined, '홍길동', NOW, SECRET)).toBe('missing');
    expect(checkHopaeToken('', '홍길동', NOW, SECRET)).toBe('missing');
    for (const bad of ['.', 'abc', 'abc.', '.abc', 'a.b.c', '!!.@@']) {
      expect(checkHopaeToken(bad, '홍길동', NOW, SECRET)).toBe('invalid');
    }
  });
});

describe('HopaeTokenGuard', () => {
  const contextWith = (
    name: unknown,
    token?: string,
    extra: Record<string, string> = {},
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          query: { name },
          headers: {
            ...(token === undefined ? {} : { 'x-hopae-token': token }),
            ...extra,
          },
          ips: ['203.0.113.7'],
          socket: { remoteAddress: '127.0.0.1' },
        }),
      }),
    }) as unknown as ExecutionContext;

  let record: jest.Mock;
  let guard: HopaeTokenGuard;

  beforeEach(() => {
    process.env.HOPAE_TOKEN_SECRET = SECRET;
    record = jest.fn();
    guard = new HopaeTokenGuard({ record } as unknown as HopaeDenialService);
  });

  afterEach(() => {
    delete process.env.HOPAE_TOKEN_SECRET;
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  const fresh = (name: string) =>
    mintHopaeToken(name, Math.floor(Date.now() / 1000) + 600, SECRET);

  it('lets a page-issued token through, matching the trimmed name, and records nothing', () => {
    expect(guard.canActivate(contextWith('  홍길동 ', fresh('홍길동')))).toBe(
      true,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('blocks a request without the header and records the real client ip', () => {
    expect(() =>
      guard.canActivate(
        contextWith('홍길동', undefined, {
          'user-agent': 'curl/8.0',
          referer: 'https://elsewhere.example/',
        }),
      ),
    ).toThrow(ForbiddenException);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      ip: '203.0.113.7',
      forwardedFor: '203.0.113.7',
      name: '홍길동',
      reason: 'missing',
      userAgent: 'curl/8.0',
      referer: 'https://elsewhere.example/',
    });
  });

  it('blocks a token reused for a different name and records it as mismatch', () => {
    expect(() =>
      guard.canActivate(contextWith('임꺽정', fresh('홍길동'))),
    ).toThrow(ForbiddenException);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ name: '임꺽정', reason: 'mismatch' }),
    );
  });

  it('blocks when the name is missing or not a string', () => {
    expect(() => guard.canActivate(contextWith(undefined, 'x.y'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(contextWith(['a', 'b'], 'x.y'))).toThrow(
      ForbiddenException,
    );
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: '', reason: 'missing' }),
    );
  });
});
