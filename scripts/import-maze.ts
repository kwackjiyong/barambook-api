// 미로 변형 맵 메타(manifest.json)를 maze_maps 컬렉션에 적재한다.
//
//   pnpm import:maze ../barambook/cdn-upload/maze-manifest.json
//   pnpm import:maze <manifest.json> --dry-run
//   pnpm import:maze <manifest.json> --portals=<map_portals.json>
//
// manifest는 barambook의 tools/prepare-maze-assets.mjs가 만든다.
// 이미지 자체는 CDN(maze/v1)에 있고 DB에는 메타만 둔다.
//
// 포탈은 레거시 지도 포탈 데이터(map_portals.json)의 500~508 항목을 붙인다.
// 미궁 벽은 매주 바뀌지만 포탈 자리는 53개 변형 전부 같다는 걸
// 벽 데이터 전수 검사(2,756칸 모두 open)로 확인했다.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConnection } from 'mongoose';
import * as dotenv from 'dotenv';
import { MazeMap, MazeMapSchema } from '../src/maze/maze.schema';

dotenv.config();

const manifestPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const portalsOption = process.argv.find((argument) =>
  argument.startsWith('--portals='),
);
const portalsPath = resolve(
  portalsOption
    ? portalsOption.slice('--portals='.length)
    : '../barambook-data/data/json/map_portals.json',
);
if (!manifestPath) {
  throw new Error('사용법: pnpm import:maze <manifest.json> [--dry-run]');
}

interface ManifestEntry {
  mapId: number;
  index: number;
  base: number;
  name: string;
  imageKey: string;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as {
  maps: ManifestEntry[];
};

// ------------------------------------------------------------------- 포탈

// 미궁 관련 목적지 이름. maps/v1 인덱스에서 확인한 실제 맵 이름을 짧게 다듬었다.
const TARGET_NAMES: Record<number, string> = {
  330: '부여성',
  500: '미궁 입구',
  501: '대미궁 1',
  502: '대미궁 2',
  503: '대미궁 3',
  504: '대미궁 4',
  505: '대미궁 5',
  506: '대미궁 6',
  507: '대미궁 7',
  508: '대미궁 8',
  509: '미궁무기상',
  512: '미궁시약상 1',
  513: '미궁시약상 2',
  514: '미궁장기알상점',
  515: '미궁화투상점',
  516: '미궁카드상점',
};

interface MazePortalDoc {
  x: number;
  y: number;
  label: string;
  jumpBase?: number;
  mapCode?: number;
}

function buildPortalsByBase(): Map<number, MazePortalDoc[]> {
  const raw = JSON.parse(readFileSync(portalsPath, 'utf8')) as {
    c: number | string;
    l?: { c: number | string; p: { x1: number; y1: number } }[];
  }[];

  const byBase = new Map<number, MazePortalDoc[]>();
  for (const doc of raw) {
    const base = Number(doc.c);
    if (base < 500 || base > 508) continue;

    // 같은 자리에 목적지가 두 갈래로 적힌 항목이 있어(원본 기록이 갈림)
    // 위치로 묶고 목적지를 전부 라벨에 남긴다.
    const byPosition = new Map<string, Set<number>>();
    for (const link of doc.l ?? []) {
      const key = `${link.p.x1},${link.p.y1}`;
      if (!byPosition.has(key)) byPosition.set(key, new Set());
      byPosition.get(key)!.add(Number(link.c));
    }

    const portals: MazePortalDoc[] = [];
    for (const [key, targets] of byPosition) {
      const [x, y] = key.split(',').map(Number);
      const codes = [...targets].sort((a, b) => a - b);
      const label = codes
        .map((code) => TARGET_NAMES[code] ?? `맵 ${code}`)
        .join(' · ');
      const single = codes.length === 1 ? codes[0] : null;
      portals.push({
        x,
        y,
        label,
        ...(single !== null && single >= 500 && single <= 508
          ? { jumpBase: single }
          : {}),
        ...(single !== null && (single < 500 || single > 508)
          ? { mapCode: single }
          : {}),
      });
    }
    portals.sort((a, b) => a.y - b.y || a.x - b.x);
    byBase.set(base, portals);
  }
  return byBase;
}

const portalsByBase = buildPortalsByBase();

const documents = manifest.maps.map((entry) => {
  if (!/^[0-9a-f]{32}$/.test(entry.imageKey ?? '')) {
    throw new Error(`${entry.mapId}: imageKey가 없거나 형식이 다르다.`);
  }
  return {
    mapId: entry.mapId,
    index: entry.index,
    base: entry.base,
    name: entry.name,
    imageKey: entry.imageKey,
    width: entry.width,
    height: entry.height,
    imageWidth: entry.imageWidth,
    imageHeight: entry.imageHeight,
    portals: portalsByBase.get(entry.base) ?? [],
  };
});

async function main() {
  const indices = new Set(documents.map((doc) => doc.index));
  const bases = new Set(documents.map((doc) => doc.base));
  console.log(
    `미로 맵 ${documents.length}개 · 변형 ${indices.size}종(index ${Math.min(...indices)}~${Math.max(...indices)}) · 베이스 ${[...bases].sort((a, b) => a - b).join(',')}`,
  );
  if (documents.length !== 477) {
    console.warn(`경고: 기대치는 477개다 (53 변형 × 9맵).`);
  }
  for (const [base, portals] of [...portalsByBase].sort((a, b) => a[0] - b[0])) {
    console.log(
      `  base ${base} 포탈 ${portals.length}개: ${portals.map((portal) => `(${portal.x},${portal.y})${portal.label}`).join(' ')}`,
    );
  }

  if (dryRun) {
    console.log('dry-run: DB에 적재하지 않았다.');
    return;
  }

  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const connection = await createConnection(
    process.env.MONGO_URL ?? 'mongodb://localhost:27017/info?authSource=admin',
    username && password ? { auth: { username, password } } : {},
  ).asPromise();

  try {
    const model = connection.model<MazeMap>('maze_maps', MazeMapSchema);
    await model.deleteMany({});
    await model.insertMany(documents, { ordered: true });
    console.log(`maze_maps 적재 완료: ${documents.length}건`);
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
