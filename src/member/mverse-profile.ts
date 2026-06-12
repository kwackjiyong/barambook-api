const MVERSE_API_ORIGIN = 'https://mverse-api.nexon.com';
const PROFILE_CODE_PATTERN = /^[A-Za-z0-9]{5}$/;

// 메이플스토리월드 기본 프로필 배경 6종 (backgroundId 1~6 고정 카탈로그)
export interface MverseBackground {
  backgroundId: number;
  title: string;
  imagePath: string;
  posterImagePath: string;
}

export const MVERSE_PROFILE_BACKGROUNDS: MverseBackground[] = [
  {
    backgroundId: 1,
    title: '센트럴 시티',
    imagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403365481.png',
    posterImagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403328156.png',
  },
  {
    backgroundId: 2,
    title: '신비의 숲 정령의 나무',
    imagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403569610.png',
    posterImagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403554367.png',
  },
  {
    backgroundId: 3,
    title: '요정의 숲 빛나는 동굴길',
    imagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403592228.png',
    posterImagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403621831.png',
  },
  {
    backgroundId: 4,
    title: '지구방위본부 UFO',
    imagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403765762.png',
    posterImagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403753474.png',
  },
  {
    backgroundId: 5,
    title: '커닝시티 뒷골목',
    imagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403784290.png',
    posterImagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403799202.png',
  },
  {
    backgroundId: 6,
    title: '판타스틱 테마파크',
    imagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403866349.png',
    posterImagePath:
      'https://mod-file.dn.nexoncdn.co.kr/profile/background/image/1664403880916.png',
  },
];

export interface MverseProfile {
  profileName: string;
  profileCode: string;
  ppsn?: string;
  // /home 엔드포인트에서만 내려오는 배경/아바타 정보
  backgroundId?: number;
  backgroundTitle?: string;
  avatarImageUrl?: string;
}

interface MverseProfileResponse {
  data?: {
    profileName?: string;
    profileCode?: string;
    ppsn?: number | string;
  };
}

interface MverseHomeResponse {
  data?: {
    avatarImageUrl?: string;
    background?: {
      backgroundId?: number;
      title?: string;
    };
  };
}

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

export const sanitizeMverseProfileCode = (value: string) =>
  value
    .trim()
    .replace(/^#/, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 5);

export const normalizeMverseProfileName = (value: string) => value.trim();

export const isSameMverseProfileName = (left: string, right: string) =>
  normalizeMverseProfileName(left) === normalizeMverseProfileName(right);

export const getMverseBackgroundById = (backgroundId?: number) =>
  MVERSE_PROFILE_BACKGROUNDS.find(
    (background) => background.backgroundId === backgroundId,
  );

// 현재 배경과 다른 배경 중 하나를 무작위로 골라 소유 검증 챌린지로 쓴다.
export const pickMverseBackgroundChallenge = (
  currentBackgroundId: number,
): MverseBackground => {
  const candidates = MVERSE_PROFILE_BACKGROUNDS.filter(
    (background) => background.backgroundId !== currentBackgroundId,
  );
  const source =
    candidates.length > 0 ? candidates : MVERSE_PROFILE_BACKGROUNDS;
  return source[Math.floor(Math.random() * source.length)];
};

/**
 * 메월 프로필 조회. 닉네임/ppsn은 `/profile/v1/profileCode/`에서,
 * 배경/아바타는 `/profile/v1/home/profileCode/`에서만 내려오므로 둘을 병합한다.
 */
export const fetchMverseProfileByCode = async (
  profileCode: string,
): Promise<MverseProfile | null> => {
  const normalizedCode = sanitizeMverseProfileCode(profileCode);

  if (!PROFILE_CODE_PATTERN.test(normalizedCode)) {
    return null;
  }

  const [profilePayload, homePayload] = await Promise.all([
    fetchJson(`${MVERSE_API_ORIGIN}/profile/v1/profileCode/${normalizedCode}`),
    fetchJson(
      `${MVERSE_API_ORIGIN}/profile/v1/home/profileCode/${normalizedCode}`,
    ),
  ]);

  const profileData = (profilePayload as MverseProfileResponse | null)?.data;
  const profileName = profileData?.profileName;

  if (!profileName) {
    return null;
  }

  const homeData = (homePayload as MverseHomeResponse | null)?.data;
  const backgroundId = homeData?.background?.backgroundId;

  return {
    profileName,
    profileCode: profileData?.profileCode ?? normalizedCode,
    ppsn: profileData?.ppsn != null ? String(profileData.ppsn) : undefined,
    backgroundId: typeof backgroundId === 'number' ? backgroundId : undefined,
    backgroundTitle: homeData?.background?.title,
    avatarImageUrl: homeData?.avatarImageUrl,
  };
};
