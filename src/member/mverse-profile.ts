const MVERSE_API_ORIGIN = 'https://mverse-api.nexon.com';
const PROFILE_CODE_PATTERN = /^[A-Za-z0-9]{5}$/;

export interface MverseProfile {
  profileName: string;
  profileCode: string;
  ppsn?: string;
  backgroundId?: number;
  backgroundTitle?: string;
  backgroundImagePath?: string;
}

interface BackgroundCandidate {
  backgroundId?: number;
  title?: string;
  imagePath?: string;
  posterImagePath?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (source: Record<string, unknown>, key: string) => {
  const value = source[key];

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
};

const readNumber = (source: Record<string, unknown>, key: string) => {
  const value = source[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  return undefined;
};

const getByPath = (source: Record<string, unknown>, path: string[]) => {
  let current: unknown = source;

  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[key];
  }

  return current;
};

const readStringByPaths = (
  source: Record<string, unknown>,
  paths: string[][],
) => {
  for (const path of paths) {
    const parent = getByPath(source, path.slice(0, -1));

    if (!isRecord(parent)) {
      continue;
    }

    const value = readString(parent, path[path.length - 1]);

    if (value) {
      return value;
    }
  }

  return undefined;
};

const readNumberByPaths = (
  source: Record<string, unknown>,
  paths: string[][],
) => {
  for (const path of paths) {
    const parent = getByPath(source, path.slice(0, -1));

    if (!isRecord(parent)) {
      continue;
    }

    const value = readNumber(parent, path[path.length - 1]);

    if (value != null) {
      return value;
    }
  }

  return undefined;
};

const readBackgroundCandidate = (
  source: Record<string, unknown>,
): BackgroundCandidate | null => {
  const directBackgroundId = readNumberByPaths(source, [
    ['backgroundId'],
    ['profileBackgroundId'],
    ['selectedBackgroundId'],
    ['profile', 'backgroundId'],
    ['profileInfo', 'backgroundId'],
  ]);

  if (directBackgroundId != null) {
    return {
      backgroundId: directBackgroundId,
      title: readStringByPaths(source, [
        ['backgroundTitle'],
        ['profileBackgroundTitle'],
        ['profile', 'backgroundTitle'],
        ['profileInfo', 'backgroundTitle'],
      ]),
      imagePath: readStringByPaths(source, [
        ['backgroundImagePath'],
        ['profileBackgroundImagePath'],
        ['profile', 'backgroundImagePath'],
        ['profileInfo', 'backgroundImagePath'],
      ]),
    };
  }

  const backgroundPaths = [
    ['background'],
    ['profileBackground'],
    ['selectedBackground'],
    ['profile', 'background'],
    ['profileInfo', 'background'],
    ['profileInfo', 'profileBackground'],
  ];

  for (const path of backgroundPaths) {
    const background = getByPath(source, path);

    if (!isRecord(background)) {
      continue;
    }

    const backgroundId =
      readNumber(background, 'backgroundId') ?? readNumber(background, 'id');

    if (backgroundId == null) {
      continue;
    }

    return {
      backgroundId,
      title: readString(background, 'title') ?? readString(background, 'name'),
      imagePath: readString(background, 'imagePath'),
      posterImagePath: readString(background, 'posterImagePath'),
    };
  }

  return null;
};

const normalizeProfile = (
  payload: unknown,
  fallbackCode: string,
): MverseProfile | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const data = isRecord(payload.data) ? payload.data : payload;
  const profileName = readString(data, 'profileName');
  const profileCode = readString(data, 'profileCode') ?? fallbackCode;

  if (!profileName) {
    return null;
  }

  const background = readBackgroundCandidate(data);

  return {
    profileName,
    profileCode,
    ppsn: readString(data, 'ppsn'),
    backgroundId: background?.backgroundId,
    backgroundTitle: background?.title,
    backgroundImagePath: background?.imagePath ?? background?.posterImagePath,
  };
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

export const fetchMverseProfileByCode = async (
  profileCode: string,
): Promise<MverseProfile | null> => {
  const normalizedCode = sanitizeMverseProfileCode(profileCode);

  if (!PROFILE_CODE_PATTERN.test(normalizedCode)) {
    return null;
  }

  const response = await fetch(
    `${MVERSE_API_ORIGIN}/profile/v1/profileCode/${normalizedCode}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json().catch(() => null);
  return normalizeProfile(payload, normalizedCode);
};
