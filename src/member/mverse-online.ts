import { sanitizeMverseProfileCode } from './mverse-profile';

const MVERSE_API_ORIGIN = 'https://mverse-api.nexon.com';
const PROFILE_CODE_PATTERN = /^[A-Za-z0-9]{5}$/;
const ONLINE_CACHE_TTL_MS = 60 * 1000;
// 한 번의 목록 조회에서 외부 API를 호출할 최대 태그 수
const ONLINE_RESOLVE_LIMIT = 25;

interface OnlineCacheEntry {
  checkedAt: number;
  isOnline: boolean | null;
}

const onlineCache = new Map<string, OnlineCacheEntry>();

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return null;
  }

  return response.json().catch(() => null);
};

const resolveOnlineStatus = async (tag: string): Promise<boolean | null> => {
  const profile = (await fetchJson(
    `${MVERSE_API_ORIGIN}/profile/v1/profileCode/${tag}`,
  )) as { data?: { ppsn?: number | string } } | null;
  const ppsn = profile?.data?.ppsn;

  if (ppsn == null || ppsn === '') {
    return null;
  }

  const social = (await fetchJson(
    `${MVERSE_API_ORIGIN}/social/v1/profile/${ppsn}`,
  )) as { data?: { isOnline?: number | string } } | null;
  const isOnline = social?.data?.isOnline;

  if (isOnline == null) {
    return null;
  }

  return Number(isOnline) === 1;
};

/**
 * 메월 프로필 태그 목록의 접속여부를 일괄 조회한다.
 * 거래소 목록 정렬용이므로 60초 캐시를 쓰고, 외부 호출 수를 제한하며
 * 실패한 태그는 null(확인 불가)로 처리한다.
 */
export const resolveMverseOnlineByTags = async (
  tags: string[],
): Promise<Map<string, boolean | null>> => {
  const now = Date.now();
  const result = new Map<string, boolean | null>();
  const pending: string[] = [];

  for (const rawTag of tags) {
    const tag = sanitizeMverseProfileCode(rawTag);

    if (!PROFILE_CODE_PATTERN.test(tag) || result.has(tag)) {
      continue;
    }

    const cached = onlineCache.get(tag);

    if (cached && now - cached.checkedAt < ONLINE_CACHE_TTL_MS) {
      result.set(tag, cached.isOnline);
      continue;
    }

    if (pending.length < ONLINE_RESOLVE_LIMIT) {
      pending.push(tag);
    }
  }

  await Promise.all(
    pending.map(async (tag) => {
      let isOnline: boolean | null = null;

      try {
        isOnline = await resolveOnlineStatus(tag);
      } catch {
        isOnline = null;
      }

      onlineCache.set(tag, { checkedAt: Date.now(), isOnline });
      result.set(tag, isOnline);
    }),
  );

  return result;
};
