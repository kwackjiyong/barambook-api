// 옛날바람 월드 원본(Published Cache)에서 뽑아 둔 테이블을 로컬 DB에 적재한다.
//
//   pnpm import:old-baram-world <game-data-extracted 디렉터리> [--only=mob,spell,map] [--images=<manifest.json>]
//
// 입력은 extract-world-datasets.mjs가 만든 { name, guid, columns, rows } JSON들이다.
// 셀은 전부 문자열이라 숫자 열마다 직접 변환한다.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Model, createConnection } from 'mongoose';
import * as dotenv from 'dotenv';
import {
  OldBaramMob,
  OldBaramMobSchema,
} from '../src/old-baram-mob/old-baram-mob.schema';
import {
  OldBaramSpell,
  OldBaramSpellSchema,
} from '../src/old-baram-spell/old-baram-spell.schema';
import {
  OldBaramMap,
  OldBaramMapSchema,
} from '../src/old-baram-map/old-baram-map.schema';
import { OLD_BARAM_JOBS } from '../src/old-baram-spell/old-baram-spell.constants';

dotenv.config();

interface TableDump {
  columns: string[];
  rows: string[][];
}

type Row = Record<string, string>;

const sourceDirectory = process.argv[2];
if (!sourceDirectory) {
  throw new Error(
    '사용법: pnpm import:old-baram-world <game-data-extracted 디렉터리> [--only=mob,spell,map]',
  );
}

const flags = process.argv.slice(3);
const onlyOption = flags.find((argument) => argument.startsWith('--only='));
const only = onlyOption
  ? new Set(onlyOption.slice('--only='.length).split(','))
  : null;
const wants = (name: string) => !only || only.has(name);

// 이미지 준비 스크립트가 만든 매니페스트가 있으면 hasImage와 크기를 채운다.
const manifestOption = flags.find((argument) =>
  argument.startsWith('--images='),
);
const imageManifestPath = manifestOption
  ? resolve(manifestOption.slice('--images='.length))
  : null;

function table(name: string): TableDump {
  const path = resolve(sourceDirectory, name + '.json');
  if (!existsSync(path)) {
    throw new Error(
      name +
        '.json이 없습니다. extract-world-datasets.mjs --dump으로 먼저 뽑아 주세요.',
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as TableDump;
}

const cache = new Map<string, Row[]>();
function rows(name: string): Row[] {
  const cached = cache.get(name);
  if (cached) return cached;
  const dump = table(name);
  const parsed = dump.rows.map((values) =>
    Object.fromEntries(
      dump.columns.map((column, index) => [column, values[index] ?? '']),
    ),
  );
  cache.set(name, parsed);
  return parsed;
}

function num(value: string | undefined) {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

interface ImageEntry {
  width?: number;
  height?: number;
  // 몬스터만: 실제로 쓸 시트 폴더와 원본 염색 일치 여부
  sheet?: string;
  exact?: boolean;
  frames?: number;
}

interface ImageManifest {
  mobs?: Record<string, ImageEntry>;
  minimaps?: Record<string, ImageEntry>;
}

const imageManifest: ImageManifest =
  imageManifestPath && existsSync(imageManifestPath)
    ? (JSON.parse(readFileSync(imageManifestPath, 'utf8')) as ImageManifest)
    : {};

// ------------------------------------------------------------------- 몬스터

function buildMobs() {
  const mobData = rows('MobData');
  const spellNames = new Map(
    rows('SpellInfo').map((row) => [row.id, row.name] as const),
  );
  const mapNames = new Map(
    rows('MapInfo').map((row) => [row.MapId, row.MapName] as const),
  );

  const spellsByMob = new Map<string, { spellId: number; name?: string }[]>();
  for (const row of rows('MobSpell')) {
    const list = spellsByMob.get(row.mobId) ?? [];
    list.push({
      spellId: Number(row.spellId),
      name: text(spellNames.get(row.spellId)),
    });
    spellsByMob.set(row.mobId, list);
  }

  const spawnsByMob = new Map<string, Record<string, unknown>[]>();
  const pushSpawn = (mobId: string, spawn: Record<string, unknown>) => {
    const list = spawnsByMob.get(mobId) ?? [];
    list.push(spawn);
    spawnsByMob.set(mobId, list);
  };
  for (const row of rows('FixedPosMobSpawn')) {
    pushSpawn(row.MobId, {
      kind: 'fixed',
      mapId: Number(row.MapId),
      mapName: text(mapNames.get(row.MapId)),
      x: num(row.x),
      y: num(row.y),
      delay: num(row.delay),
    });
  }
  for (const row of rows('DimensionMobSpawn')) {
    pushSpawn(row.mobId, {
      kind: 'dimension',
      mapId: Number(row.MapId),
      mapName: text(mapNames.get(row.MapId)) ?? text(row.mapname),
      x0: num(row.x0),
      x1: num(row.x1),
      y0: num(row.y0),
      y1: num(row.y1),
      count: num(row.count),
      respawn: num(row.respawn),
      boss: row.boss === '1',
    });
  }

  return mobData.map((row) => {
    const imageId = num(row.image) ?? 0;
    const dye = num(row.dye) ?? 0;
    const image = imageManifest.mobs?.[imageId + '-' + dye];
    return {
      mobId: Number(row.id),
      name: row.name,
      imageId,
      dye,
      maxHp: num(row.MHP) ?? 0,
      exp: num(row.EXP) ?? 0,
      armorClass: num(row.ac) ?? 0,
      magicDefense: num(row.md),
      size: row.size || 's',
      attackType: num(row.attacktype),
      damageMin: num(row.min),
      damageMax: num(row.max),
      attackInterval: num(row.interval),
      paralyzable: row.paralyze === '1',
      despairable: row.despair === '1',
      spells: spellsByMob.get(row.id) ?? [],
      spawns: spawnsByMob.get(row.id) ?? [],
      hasImage: Boolean(image),
      imageKey: image?.sheet,
      imageExact: image?.exact ?? true,
      imageWidth: image?.width,
      imageHeight: image?.height,
      frameCount: image?.frames,
    };
  });
}

// --------------------------------------------------------------------- 마법

// "99,금전,5000,도토리,100,대마령봉,1" → 레벨 99 + 재료 3종
function parseLearn(value: string) {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return null;
  const level = Number(parts[0]);
  if (!Number.isFinite(level)) return null;
  const materials: { name: string; count: number }[] = [];
  for (let index = 1; index + 1 < parts.length; index += 2) {
    const count = Number(parts[index + 1]);
    materials.push({
      name: parts[index],
      count: Number.isFinite(count) ? count : 0,
    });
  }
  return { level, materials };
}

function buildSpells() {
  const mobNames = new Map(
    rows('MobData').map((row) => [row.id, row.name] as const),
  );

  const mobsBySpell = new Map<string, { mobId: number; name?: string }[]>();
  for (const row of rows('MobSpell')) {
    const list = mobsBySpell.get(row.spellId) ?? [];
    list.push({
      mobId: Number(row.mobId),
      name: text(mobNames.get(row.mobId)),
    });
    mobsBySpell.set(row.spellId, list);
  }

  return rows('SpellInfo')
    .filter((row) => row.name.trim() !== '')
    .map((row) => {
      const learn = OLD_BARAM_JOBS.flatMap((job) => {
        const parsed = parseLearn(row[job.column] ?? '');
        if (!parsed) return [];
        return [
          {
            job: job.value,
            jobName: job.label,
            level: parsed.level,
            materials: parsed.materials,
          },
        ];
      });
      const mobs = mobsBySpell.get(row.id) ?? [];
      // SpellManager.GetSpellsInfoClient가 type 2·3·9면 guide=true를 세우고,
      // 아니면 msg를 guide로 쓴다. RequestCastSpell은 그 값으로 세 갈래로 갈린다.
      const type = num(row.type);
      const castMode =
        type === 2 || type === 3 || type === 9
          ? 'target'
          : text(row.msg)
            ? 'prompt'
            : 'instant';
      return {
        spellId: Number(row.id),
        name: row.name.trim(),
        type,
        castMode,
        delayGroup: num(row.delaygroup),
        learn,
        jobs: learn.map((entry) => entry.job),
        minLevel: learn.length
          ? Math.min(...learn.map((entry) => entry.level))
          : undefined,
        promptMessage: text(row.msg),
        sayMessage: text(row.say),
        castMessage: text(row.oncast),
        affectedMessage: text(row.onaffected),
        removedMessage: text(row.onremoved),
        negative: row.isnegative === '1',
        curse: row.curse === '1',
        internal: row.name.trim().startsWith('_'),
        mobs,
        mobOnly: learn.length === 0 && mobs.length > 0,
      };
    });
}

// --------------------------------------------------------------------- 지도

// 지도의 가로·세로 칸 수. 미니맵 위에 포탈을 찍으려면 이게 있어야 한다.
// 미니맵 1칸 크기 = 미니맵 가로 픽셀 / 지도 가로 칸 수 (MinimapUI.LoadMap의 mag).
//
// 칸 수는 MapDataRaw_1~5를 이어 붙인 "가로;세로;타일;타일;…" 문자열의 앞 두 값이다.
// MapDataIndexMap이 지도마다 그 시작·끝 줄을 가리키는데, ref가 있으면 다른 지도의
// 데이터를 그대로 쓴다(19,511개 중 17,125개가 남의 것을 참조한다).
function readMapSizes(): Record<number, { w: number; h: number }> {
  const raw: string[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const path = resolve(sourceDirectory, `MapDataRaw_${page}.json`);
    if (!existsSync(path)) return {};
    const dump = JSON.parse(readFileSync(path, 'utf8')) as TableDump;
    for (const row of dump.rows) raw.push(row[0] ?? '');
  }

  const sizes = new Map<number, { w: number; h: number }>();
  const references = new Map<number, number>();
  for (const row of rows('MapDataIndexMap')) {
    const mapId = Number(row.id);
    if (row.ref !== '') {
      references.set(mapId, Number(row.ref));
      continue;
    }
    const [width, height] = (raw[Number(row.s) - 1] ?? '').split(';');
    sizes.set(mapId, { w: Number(width), h: Number(height) });
  }
  for (const [mapId, reference] of references) {
    let target = reference;
    for (let hop = 0; hop < 20 && references.has(target); hop += 1) {
      target = references.get(target) as number;
    }
    const size = sizes.get(target);
    if (size) sizes.set(mapId, size);
  }
  return Object.fromEntries(sizes);
}

function buildMaps() {
  const mapInfo = rows('MapInfo');
  const minimap = new Set(rows('Minimap').map((row) => row.id));
  const mobNames = new Map(
    rows('MobData').map((row) => [row.id, row.name] as const),
  );
  // 게임에서 막아 둔 지도는 포탈 목적지로 치지 않는다(클라이언트도 같다).
  const liveMapNames = new Map(
    mapInfo
      .filter((row) => row.Disable !== '1')
      .map((row) => [row.MapId, row.MapName] as const),
  );
  const mapNames = new Map(
    mapInfo.map((row) => [row.MapId, row.MapName] as const),
  );
  const mapSizes = readMapSizes();

  // 포탈은 세 표에 나눠 담겨 있다. 미니맵에 찍으려면 한 곳에 모아야 한다.
  // MapResourceManager.InitClient가 Portal · WorldMapPortal · ScriptPortal을
  // 같은 좌표 표에 쌓는 것과 같은 순서·조건으로 맞췄다.
  const portalsByMap = new Map<string, Record<string, unknown>[]>();
  const pushPortal = (mapId: string, portal: Record<string, unknown>) => {
    const list = portalsByMap.get(mapId) ?? [];
    list.push(portal);
    portalsByMap.set(mapId, list);
  };
  for (const row of rows('Portal')) {
    if (row.disable === '1') continue;
    if (!liveMapNames.has(row.map0) || !liveMapNames.has(row.map1)) continue;
    pushPortal(row.map0, {
      kind: 'map',
      x: num(row.posx0) ?? 0,
      y: num(row.posy0) ?? 0,
      label: text(liveMapNames.get(row.map1)),
      toMapId: num(row.map1) ?? 0,
      toMapName: text(liveMapNames.get(row.map1)),
      toX: num(row.posx1),
      toY: num(row.posy1),
      min: num(row.min),
      max: num(row.max),
    });
  }
  for (const row of rows('WorldMapPortal')) {
    pushPortal(row.map0, {
      kind: 'world',
      x: num(row.posx0) ?? 0,
      y: num(row.posy0) ?? 0,
      label: '세계이동',
    });
  }
  for (const row of rows('ScriptPortal')) {
    pushPortal(row.map0, {
      kind: 'script',
      x: num(row.x0) ?? 0,
      y: num(row.y0) ?? 0,
      label: text(row.scriptName) ?? text(row.script) ?? '특수 이동',
      min: num(row.min),
      max: num(row.max),
    });
  }

  const mobsByMap = new Map<string, Record<string, unknown>[]>();
  const pushMob = (mapId: string, mob: Record<string, unknown>) => {
    const list = mobsByMap.get(mapId) ?? [];
    list.push(mob);
    mobsByMap.set(mapId, list);
  };
  for (const row of rows('FixedPosMobSpawn')) {
    pushMob(row.MapId, {
      kind: 'fixed',
      mobId: Number(row.MobId),
      name: text(mobNames.get(row.MobId)),
      x: num(row.x),
      y: num(row.y),
      delay: num(row.delay),
    });
  }
  for (const row of rows('DimensionMobSpawn')) {
    pushMob(row.MapId, {
      kind: 'dimension',
      mobId: Number(row.mobId),
      name: text(mobNames.get(row.mobId)) ?? text(row.mobname),
      count: num(row.count),
      respawn: num(row.respawn),
      boss: row.boss === '1',
    });
  }

  const worldMapByMap = new Map(
    rows('WorldMap').map((row) => [row.mapId, row] as const),
  );

  return mapInfo.map((row) => {
    const portals = portalsByMap.get(row.MapId) ?? [];
    const mobs = mobsByMap.get(row.MapId) ?? [];
    const world = worldMapByMap.get(row.MapId);
    const image = imageManifest.minimaps?.[row.MapId];
    const size = mapSizes[Number(row.MapId)];
    return {
      mapId: Number(row.MapId),
      name: row.MapName,
      width: size?.w,
      height: size?.h,
      parentMapId: num(row.ParentMapId),
      parentName: text(mapNames.get(row.ParentMapId)),
      keyword: text(row.Keyword),
      bgm: num(row.BGM),
      attr: num(row.Attr),
      returnMap: text(row.ReturnMap),
      script: text(row.Script),
      disabled: row.Disable === '1',
      portals,
      portalCount: portals.length,
      mobs,
      mobCount: mobs.length,
      hasMinimap: imageManifestPath ? Boolean(image) : minimap.has(row.MapId),
      minimapWidth: image?.width,
      minimapHeight: image?.height,
      worldMapName: text(world?.name),
      worldMapX: num(world?.px),
      worldMapY: num(world?.py),
    };
  });
}

// --------------------------------------------------------------------- 적재

async function load(
  model: Model<any>,
  documents: Record<string, unknown>[],
  key: string,
  label: string,
) {
  for (let index = 0; index < documents.length; index += 500) {
    const batch = documents.slice(index, index + 500);
    await model.bulkWrite(
      batch.map((document) => ({
        replaceOne: {
          filter: { [key]: document[key] },
          replacement: document,
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  console.log(label + ': ' + documents.length + '개 완료');
}

async function main() {
  const available = readdirSync(sourceDirectory).filter((name) =>
    name.endsWith('.json'),
  );
  console.log(sourceDirectory + ': 원본 테이블 ' + available.length + '개');
  if (imageManifestPath) {
    console.log(
      '이미지 매니페스트: 몬스터 ' +
        Object.keys(imageManifest.mobs ?? {}).length +
        ' · 미니맵 ' +
        Object.keys(imageManifest.minimaps ?? {}).length,
    );
  }

  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const connection = await createConnection(
    process.env.MONGO_URL ?? 'mongodb://localhost:27017/info?authSource=admin',
    username && password ? { auth: { username, password } } : {},
  ).asPromise();

  try {
    if (wants('mob')) {
      await load(
        connection.model<OldBaramMob>('old_baram_mobs', OldBaramMobSchema),
        buildMobs(),
        'mobId',
        '몬스터',
      );
    }
    if (wants('spell')) {
      await load(
        connection.model<OldBaramSpell>(
          'old_baram_spells',
          OldBaramSpellSchema,
        ),
        buildSpells(),
        'spellId',
        '마법',
      );
    }
    if (wants('map')) {
      await load(
        connection.model<OldBaramMap>('old_baram_maps', OldBaramMapSchema),
        buildMaps(),
        'mapId',
        '지도',
      );
    }
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
