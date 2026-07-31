import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('lets a burst through and then holds the line at the refill rate', () => {
    const limiter = new RateLimiter(10, 30);
    const start = 1_000_000;

    // 모아 둔 토큰만큼은 한꺼번에 나간다.
    for (let call = 0; call < 30; call += 1) {
      expect(limiter.consume('1.1.1.1', start).allowed).toBe(true);
    }
    expect(limiter.consume('1.1.1.1', start).allowed).toBe(false);

    // 1초 뒤에는 초당 속도만큼만 다시 열린다.
    for (let call = 0; call < 10; call += 1) {
      expect(limiter.consume('1.1.1.1', start + 1000).allowed).toBe(true);
    }
    expect(limiter.consume('1.1.1.1', start + 1000).allowed).toBe(false);
  });

  it('never tells the caller to retry in zero seconds', () => {
    const limiter = new RateLimiter(0.5, 1);
    const start = 1_000_000;

    expect(limiter.consume('1.1.1.1', start).allowed).toBe(true);
    const blocked = limiter.consume('1.1.1.1', start);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('counts each client separately', () => {
    const limiter = new RateLimiter(1, 1);
    const start = 1_000_000;

    expect(limiter.consume('1.1.1.1', start).allowed).toBe(true);
    expect(limiter.consume('1.1.1.1', start).allowed).toBe(false);
    // 옆 사람이 다 썼다고 내 몫이 줄지는 않는다.
    expect(limiter.consume('2.2.2.2', start).allowed).toBe(true);
  });

  it('caps how much it remembers so the limiter cannot be used to eat memory', () => {
    const limiter = new RateLimiter(10, 10, 100);
    const start = 1_000_000;

    // 서로 다른 주소로 상한을 훌쩍 넘겨 두드린다.
    for (let index = 0; index < 500; index += 1) {
      limiter.consume(`10.0.0.${index}`, start + index);
    }

    expect(limiter.size).toBeLessThanOrEqual(100);
    // 정리 뒤에도 제한 자체는 계속 걸린다.
    for (let call = 0; call < 10; call += 1) {
      limiter.consume('9.9.9.9', start + 500);
    }
    expect(limiter.consume('9.9.9.9', start + 500).allowed).toBe(false);
  });
});
