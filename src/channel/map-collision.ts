import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { disabledPositions } from '../assets/object/330_disabled_xy';

export type MoveDirection = 'up' | 'down' | 'left' | 'right';
export type ChannelKey =
  | '39750'
  | '330'
  | '45000'
  | '2028'
  | '45183'
  | '6523'
  | '800'
  | '2080'
  | '6571'
  | '67000'
  | '45200'
  | '690'
  | '790'
  | '41007';

/**
 * 채널 하나에 대응하는 맵 설정. 맵을 바꾸려면 cmpName/리스폰 좌표만 교체하면 된다.
 * width/height 는 폴백(.cmp 미로딩 시)·테스트용 기본 치수이며,
 * 런타임 로딩에 성공하면 .cmp 헤더 값으로 대체된다.
 */
export interface MapConfig {
  channelKey: ChannelKey;
  channelLabel: string;
  mapName: string;
  cmpName: string;
  tileSize: number;
  width: number;
  height: number;
  respawnCenterTileX: number;
  respawnCenterTileY: number;
}

/**
 * 허브채널(맵 39750) 설정. 초기 입장(허브) 맵.
 * 상단 포탈 타일(14,4)/(15,4)에서 부여성·고균도 채널 선택 팝업으로 이동한다(프론트 처리).
 * respawn 은 포탈에서 떨어진 안쪽 칸으로 두어 입장 즉시 팝업이 뜨지 않게 한다.
 */
export const SUNJE_MAP_CONFIG: MapConfig = {
  channelKey: '39750',
  channelLabel: '입장맵',
  mapName: 'Ba039750.map',
  cmpName: 'Ba039750.cmp',
  tileSize: 24,
  width: 40,
  height: 40,
  respawnCenterTileX: 14,
  respawnCenterTileY: 15,
};

/** 부여성(맵 330) 설정. */
export const BUYEO_MAP_CONFIG: MapConfig = {
  channelKey: '330',
  channelLabel: '부여성',
  mapName: 'Ba000330.map',
  cmpName: 'Ba000330.cmp',
  tileSize: 24,
  width: 146,
  height: 156,
  respawnCenterTileX: 71,
  respawnCenterTileY: 130,
};

export const GOGYUNDO_MAP_CONFIG: MapConfig = {
  channelKey: '45000',
  channelLabel: '고균도',
  mapName: 'Ba045000.map',
  cmpName: 'Ba045000.cmp',
  tileSize: 24,
  width: 220,
  height: 200,
  respawnCenterTileX: 110,
  respawnCenterTileY: 100,
};

/** 북극점(맵 2028) 설정. */
export const NORTH_POLE_MAP_CONFIG: MapConfig = {
  channelKey: '2028',
  channelLabel: '북극점',
  mapName: 'Ba002028.map',
  cmpName: 'Ba002028.cmp',
  tileSize: 24,
  width: 64,
  height: 64,
  respawnCenterTileX: 32,
  respawnCenterTileY: 32,
};

/** 고균도전망대1(맵 45183) 설정. 소형 맵(17×15). */
export const GOGYUNDO_OBSERVATORY_MAP_CONFIG: MapConfig = {
  channelKey: '45183',
  channelLabel: '고균도전망대1',
  mapName: 'Ba045183.map',
  cmpName: 'Ba045183.cmp',
  tileSize: 24,
  width: 17,
  height: 15,
  respawnCenterTileX: 6,
  respawnCenterTileY: 10,
};

/** 오작교(맵 6523) 설정. 가로로 긴 맵(100×30). */
export const OJAKGYO_MAP_CONFIG: MapConfig = {
  channelKey: '6523',
  channelLabel: '오작교',
  mapName: 'Ba006523.map',
  cmpName: 'Ba006523.cmp',
  tileSize: 24,
  width: 100,
  height: 30,
  respawnCenterTileX: 50,
  respawnCenterTileY: 13,
};

/** 부여동부0(맵 800) 설정. 대형 맵(250×180). */
export const BUYEO_EAST_MAP_CONFIG: MapConfig = {
  channelKey: '800',
  channelLabel: '부여동부0',
  mapName: 'Ba000800.map',
  cmpName: 'Ba000800.cmp',
  tileSize: 24,
  width: 250,
  height: 180,
  respawnCenterTileX: 125,
  respawnCenterTileY: 90,
};

/** 갑판00(맵 2080) 설정. 세로로 긴 맵(30×60). */
export const DECK_MAP_CONFIG: MapConfig = {
  channelKey: '2080',
  channelLabel: '갑판00',
  mapName: 'Ba002080.map',
  cmpName: 'Ba002080.cmp',
  tileSize: 24,
  width: 30,
  height: 60,
  respawnCenterTileX: 15,
  respawnCenterTileY: 30,
};

/** 달맞이고개(맵 6571) 설정. 가로로 긴 맵(200×40). 리스폰은 상단 배경이 보이는 (99,9). */
export const DALMAJI_MAP_CONFIG: MapConfig = {
  channelKey: '6571',
  channelLabel: '달맞이고개',
  mapName: 'Ba006571.map',
  cmpName: 'Ba006571.cmp',
  tileSize: 24,
  width: 200,
  height: 40,
  respawnCenterTileX: 99,
  respawnCenterTileY: 9,
};

/** 너구리마을(맵 67000) 설정. 소형 맵(40×30). */
export const RACCOON_VILLAGE_MAP_CONFIG: MapConfig = {
  channelKey: '67000',
  channelLabel: '너구리마을',
  mapName: 'Ba067000.map',
  cmpName: 'Ba067000.cmp',
  tileSize: 24,
  width: 40,
  height: 30,
  respawnCenterTileX: 20,
  respawnCenterTileY: 15,
};

/** 폭염도(맵 45200) 설정. 지정 리스폰 중심은 (95, 143). */
export const HEAT_ISLAND_MAP_CONFIG: MapConfig = {
  channelKey: '45200',
  channelLabel: '폭염도',
  mapName: 'Ba045200.map',
  cmpName: 'Ba045200.cmp',
  tileSize: 24,
  width: 200,
  height: 200,
  respawnCenterTileX: 95,
  respawnCenterTileY: 143,
};

/** 소극장(맵 690) 설정. 소형 맵(30×30). */
export const SMALL_THEATER_MAP_CONFIG: MapConfig = {
  channelKey: '690',
  channelLabel: '소극장',
  mapName: 'Ba000690.map',
  cmpName: 'Ba000690.cmp',
  tileSize: 24,
  width: 30,
  height: 30,
  respawnCenterTileX: 15,
  respawnCenterTileY: 15,
};

/** 길림청룡신전(맵 790) 설정. 소형 맵(32×32). */
export const GILIM_BLUE_DRAGON_SHRINE_MAP_CONFIG: MapConfig = {
  channelKey: '790',
  channelLabel: '길림청룡신전',
  mapName: 'Ba000790.map',
  cmpName: 'Ba000790.cmp',
  tileSize: 24,
  width: 32,
  height: 32,
  respawnCenterTileX: 17,
  respawnCenterTileY: 16,
};

/** 원혼의방(맵 41007) 설정. 소형 맵(15×15). */
export const RESTLESS_SPIRIT_ROOM_MAP_CONFIG: MapConfig = {
  channelKey: '41007',
  channelLabel: '원혼의방',
  mapName: 'Ba041007.map',
  cmpName: 'Ba041007.cmp',
  tileSize: 24,
  width: 15,
  height: 15,
  respawnCenterTileX: 7,
  respawnCenterTileY: 7,
};

export const DEFAULT_CHANNEL_KEY: ChannelKey = DALMAJI_MAP_CONFIG.channelKey;
export const CHANNEL_MAP_CONFIGS = [
  DALMAJI_MAP_CONFIG,
  BUYEO_MAP_CONFIG,
  GOGYUNDO_MAP_CONFIG,
  NORTH_POLE_MAP_CONFIG,
  GOGYUNDO_OBSERVATORY_MAP_CONFIG,
  OJAKGYO_MAP_CONFIG,
  BUYEO_EAST_MAP_CONFIG,
  DECK_MAP_CONFIG,
  RACCOON_VILLAGE_MAP_CONFIG,
  HEAT_ISLAND_MAP_CONFIG,
  SMALL_THEATER_MAP_CONFIG,
  GILIM_BLUE_DRAGON_SHRINE_MAP_CONFIG,
  RESTLESS_SPIRIT_ROOM_MAP_CONFIG,
] as const satisfies readonly MapConfig[];

export function normalizeChannelKey(value: unknown): ChannelKey {
  // 소켓 query 값은 string | string[] | undefined 등 무엇이든 올 수 있으므로 unknown 으로 받아 문자열만 추린다.
  const rawValue: unknown = Array.isArray(value) ? value[0] : value;
  const rawChannelKey = typeof rawValue === 'string' ? rawValue : '';
  const channelKey =
    rawChannelKey === 'buyeo'
      ? BUYEO_MAP_CONFIG.channelKey
      : rawChannelKey === 'gogyundo'
        ? GOGYUNDO_MAP_CONFIG.channelKey
        : rawChannelKey;

  return CHANNEL_MAP_CONFIGS.some((config) => config.channelKey === channelKey)
    ? (channelKey as ChannelKey)
    : DEFAULT_CHANNEL_KEY;
}

const CDN_BASE = (
  process.env.CDN_URL ?? 'https://d9dw0d9hih79y.cloudfront.net'
).replace(/\/$/, '');
const TILE_DAT_URL = `${CDN_BASE}/data/dat/TILE.DAT`;

/**
 * 한 맵의 충돌 정보. 좌표는 모두 타일 단위.
 *  - noMove: `.cmp`(DMAP/CMAP)의 no_move!=0 셀 → 그 칸 자체에 설 수 없음.
 *  - edgeMask: 정적 오브젝트의 이동 차단 비트마스크(SObj.tbl) → 칸의 특정 변이 벽.
 *    0x01 아랫변 / 0x02 윗변 / 0x04 좌변 / 0x08 우변. 변은 인접 두 칸이 공유하므로 양방향 차단.
 */
export class MapCollision {
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly noMove: Set<number>,
    private readonly edgeMask: Map<number, number>,
  ) {}

  get noMoveCount(): number {
    return this.noMove.size;
  }

  get edgeCount(): number {
    return this.edgeMask.size;
  }

  private indexOf(tileX: number, tileY: number): number {
    return tileY * this.width + tileX;
  }

  private inBounds(tileX: number, tileY: number): boolean {
    return (
      tileX >= 0 && tileY >= 0 && tileX < this.width && tileY < this.height
    );
  }

  /** 그 칸에 설 수 있는가(경계 밖·no_move 면 false). 엣지(변 벽)는 고려하지 않는다. */
  isWalkableTile(tileX: number, tileY: number): boolean {
    if (!this.inBounds(tileX, tileY)) {
      return false;
    }
    return !this.noMove.has(this.indexOf(tileX, tileY));
  }

  private maskAt(tileX: number, tileY: number): number {
    if (!this.inBounds(tileX, tileY)) {
      return 0;
    }
    return this.edgeMask.get(this.indexOf(tileX, tileY)) ?? 0;
  }

  /**
   * (fromTileX, fromTileY)에서 한 칸 인접한 방향으로 이동할 수 있는가.
   * 목적지가 설 수 있는 칸이어야 하고, 두 칸이 공유하는 변에 오브젝트 벽이 없어야 한다.
   */
  canCross(
    fromTileX: number,
    fromTileY: number,
    direction: MoveDirection,
  ): boolean {
    let toX = fromTileX;
    let toY = fromTileY;
    switch (direction) {
      case 'up':
        toY -= 1;
        break;
      case 'down':
        toY += 1;
        break;
      case 'left':
        toX -= 1;
        break;
      case 'right':
        toX += 1;
        break;
    }

    if (!this.isWalkableTile(toX, toY)) {
      return false;
    }

    const from = this.maskAt(fromTileX, fromTileY);
    const to = this.maskAt(toX, toY);

    switch (direction) {
      case 'up':
        return ((from & 0x02) | (to & 0x01)) === 0;
      case 'down':
        return ((from & 0x01) | (to & 0x02)) === 0;
      case 'left':
        return ((from & 0x04) | (to & 0x08)) === 0;
      case 'right':
        return ((from & 0x08) | (to & 0x04)) === 0;
    }
  }
}

/** `.cmp` 미로딩 시 사용하는 동기 폴백. 부여성(330)의 추출 좌표만 반영(엣지 없음). */
export function buildFallbackCollision(config: MapConfig): MapCollision {
  const noMove = new Set<number>();

  if (config.channelKey === BUYEO_MAP_CONFIG.channelKey) {
    for (const position of disabledPositions) {
      noMove.add(position.y * config.width + position.x);
    }
  }

  return new MapCollision(config.width, config.height, noMove, new Map());
}

// ── 바이너리 파싱 (baram-map-edit / frontend channel-map 에서 포팅) ──────────────

class BinaryReader {
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(offset: number): number {
    return this.view.getUint8(offset);
  }

  u16le(offset: number): number {
    return this.view.getUint16(offset, true);
  }

  u32le(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  ascii(offset: number, length: number): string {
    let end = offset;
    while (end < offset + length && this.bytes[end] !== 0) {
      end += 1;
    }
    return String.fromCharCode(...this.bytes.subarray(offset, end));
  }

  slice(offset: number, length: number): Uint8Array {
    return this.bytes.subarray(offset, offset + length);
  }
}

interface CmpData {
  width: number;
  height: number;
  /** 각 셀 { tile, noMove, object }. 길이 = width*height. */
  cells: { object: number; noMove: number }[];
}

/**
 * `.cmp` 충돌 파일. 헤더 = magic[4]("DMAP" 또는 "CMAP") + u16le width + u16le height.
 * payload 셀은 맵에 따라 12B({u32 tile, u32 no_move, u32 object}) 또는
 * 6B({u16 tile, u16 no_move, u16 object}) little-endian 변형이 있다.
 */
function parseCmp(bytes: Uint8Array): CmpData {
  const reader = new BinaryReader(bytes);
  const magic = reader.ascii(0, 4);
  if (magic !== 'DMAP' && magic !== 'CMAP') {
    throw new Error(`Not a DMAP/CMAP collision file (magic="${magic}")`);
  }

  const width = reader.u16le(4);
  const height = reader.u16le(6);
  const payload = inflateSync(Buffer.from(bytes.subarray(8)));
  const cellCount = width * height;
  const stride =
    payload.length === cellCount * 12
      ? 12
      : payload.length === cellCount * 6
        ? 6
        : 0;
  if (stride === 0) {
    throw new Error(
      `Unexpected CMP payload size: ${payload.length} for ${width}x${height}`,
    );
  }

  const payloadReader = new BinaryReader(payload);
  const cells = new Array<{ object: number; noMove: number }>(cellCount);
  let pos = 0;
  for (let i = 0; i < cells.length; i += 1) {
    if (stride === 12) {
      cells[i] = {
        noMove: payloadReader.u32le(pos + 4),
        object: payloadReader.u32le(pos + 8),
      };
      pos += 12;
      continue;
    }

    cells[i] = {
      noMove: payloadReader.u16le(pos + 2),
      object: payloadReader.u16le(pos + 4),
    };
    pos += 6;
  }

  return { width, height, cells };
}

/** `TILE.DAT` TOC 아카이브(little-endian). 필요한 파일(sobj.tbl)만 꺼낸다. */
function readDatEntry(bytes: Uint8Array, name: string): Uint8Array {
  const reader = new BinaryReader(bytes);
  const fileCount = reader.u32le(0) - 1;
  let pos = 4;
  const entries: { name: string; offset: number }[] = [];
  for (let i = 0; i < fileCount; i += 1) {
    entries.push({
      offset: reader.u32le(pos),
      name: reader.ascii(pos + 4, 13),
    });
    pos += 17;
  }
  const sentinel = reader.u32le(pos);

  const target = name.toLowerCase();
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].name.toLowerCase() !== target) {
      continue;
    }
    const nextOffset =
      i + 1 < entries.length ? entries[i + 1].offset : sentinel;
    return reader.slice(entries[i].offset, nextOffset - entries[i].offset);
  }
  throw new Error(`${name} was not found in TILE.DAT`);
}

/**
 * `SObj.tbl` 에서 오브젝트 인덱스별 이동차단 비트마스크를 뽑는다.
 * 레코드: 5바이트 스킵 + u8 movementDirection + u8 height + height*u16le tileIndices.
 */
function parseSObjMovementMasks(bytes: Uint8Array): number[] {
  const reader = new BinaryReader(bytes);
  const count = reader.u32le(0);
  const masks = new Array<number>(count);
  let pos = 6;
  for (let i = 0; i < count; i += 1) {
    pos += 5;
    const movementDirection = reader.u8(pos);
    const height = reader.u8(pos + 1);
    pos += 2 + height * 2;
    masks[i] = movementDirection & 0x0f;
  }
  return masks;
}

// SObj 마스크는 맵과 무관한 정적 데이터다. 프로세스 1회만 받고, watch 재시작을 위해 임시폴더에 캐시.
const SOBJ_CACHE_PATH = path.join(os.tmpdir(), 'barambook-sobj-movement.json');
let sObjMasksPromise: Promise<number[]> | null = null;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (status ${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function loadSObjMovementMasks(): Promise<number[]> {
  if (sObjMasksPromise) {
    return sObjMasksPromise;
  }

  sObjMasksPromise = (async () => {
    try {
      const cached = fs.readFileSync(SOBJ_CACHE_PATH, 'utf-8');
      const parsed = JSON.parse(cached) as number[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // 캐시 없음/손상 → 새로 받는다.
    }

    const datBytes = await fetchBytes(TILE_DAT_URL);
    const masks = parseSObjMovementMasks(readDatEntry(datBytes, 'sobj.tbl'));
    try {
      fs.writeFileSync(SOBJ_CACHE_PATH, JSON.stringify(masks));
    } catch {
      // 캐시 기록 실패는 무시(다음 부팅에 다시 받을 뿐).
    }
    return masks;
  })().catch((error) => {
    sObjMasksPromise = null;
    throw error;
  });

  return sObjMasksPromise;
}

/**
 * 채널 맵의 충돌 정보를 CDN 의 `.cmp` + `TILE.DAT`(SObj.tbl)에서 런타임 로딩한다.
 * no_move 셀과, 정적 오브젝트가 깔린 셀의 방향 엣지 마스크를 함께 구성한다.
 */
export async function loadMapCollision(
  config: MapConfig,
): Promise<MapCollision> {
  const [cmpBytes, sObjMasks] = await Promise.all([
    fetchBytes(`${CDN_BASE}/map_data/${config.cmpName}`),
    loadSObjMovementMasks(),
  ]);

  const cmp = parseCmp(cmpBytes);
  const noMove = new Set<number>();
  const edgeMask = new Map<number, number>();

  for (let i = 0; i < cmp.cells.length; i += 1) {
    const cell = cmp.cells[i];
    if (cell.noMove !== 0) {
      noMove.add(i);
    }

    // 에디터(objectBlockMask)와 동일하게 object-1 로 SObj.tbl 을 인덱싱하고 id 0/1 은 건너뛴다.
    const objectIndex = cell.object - 1;
    if (objectIndex > 0 && objectIndex < sObjMasks.length) {
      const mask = sObjMasks[objectIndex];
      if (mask !== 0) {
        edgeMask.set(i, mask);
      }
    }
  }

  return new MapCollision(cmp.width, cmp.height, noMove, edgeMask);
}
