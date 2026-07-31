export interface RateLimitResult {
  allowed: boolean;
  /** 막혔을 때 몇 초 뒤에 다시 오면 되는지. 통과했으면 0. */
  retryAfterSeconds: number;
}

/**
 * 키(대개 클라이언트 IP) 하나당 토큰 버킷.
 *
 * 초당 `ratePerSecond` 개씩 차오르고 최대 `burst` 개까지 모인다.
 * 화면을 넘기며 그림 몇 장을 한꺼번에 받아 가는 정상 사용은 모아 둔 토큰으로 흡수하고,
 * 전량 수집처럼 끝없이 이어지는 요청만 초당 속도에 묶인다.
 */
export class RateLimiter {
  private readonly buckets = new Map<
    string,
    { tokens: number; updatedAt: number }
  >();

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
    /**
     * 버킷 수 상한. 제한 장치 자체가 메모리를 무한정 먹는 통로가 되지 않도록 잡아 둔다.
     * 넘어서면 이미 가득 찬(=쉬고 있는) 버킷부터 버린다.
     */
    private readonly maxKeys = 20_000,
  ) {}

  /** 지금 기억하고 있는 키 수. 정리가 도는지 확인할 때 쓴다. */
  get size(): number {
    return this.buckets.size;
  }

  /** 토큰 한 개를 쓰고 통과 여부를 정한다. */
  consume(key: string, now = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);
    const tokens = bucket
      ? Math.min(
          this.burst,
          bucket.tokens +
            ((now - bucket.updatedAt) / 1000) * this.ratePerSecond,
        )
      : this.burst;

    if (tokens < 1) {
      this.buckets.set(key, { tokens, updatedAt: now });
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((1 - tokens) / this.ratePerSecond),
        ),
      };
    }

    this.buckets.set(key, { tokens: tokens - 1, updatedAt: now });
    if (this.buckets.size > this.maxKeys) this.evict(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /**
   * 가득 찰 만큼 쉰 버킷은 지워도 상태가 같다(다음 요청 때 가득 찬 채로 다시 생긴다).
   * 그것만으로 부족하면 가장 오래 손대지 않은 것부터 마저 버린다.
   */
  private evict(now: number): void {
    const idleAfter = (this.burst / this.ratePerSecond) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt >= idleAfter) this.buckets.delete(key);
    }
    if (this.buckets.size <= this.maxKeys) return;

    const oldestFirst = [...this.buckets.entries()].sort(
      (left, right) => left[1].updatedAt - right[1].updatedAt,
    );
    for (const [key] of oldestFirst.slice(
      0,
      this.buckets.size - this.maxKeys,
    )) {
      this.buckets.delete(key);
    }
  }
}
