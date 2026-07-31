import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import {
  OldBaramRenderer,
  SLOT_KEYS,
  type OldBaramRenderRequest,
  type OldBaramSlotKey,
} from '../src/lib/old-baram/renderer';

/**
 * 의상실 부위 선택 목록에 뿌릴 썸네일 시트를 만든다.
 *
 * 부위 하나에 PNG 한 장(격자로 늘어놓은 시트)과 칸 좌표를 담은 index.json 을 내고,
 * 통파일(.obp) 해시를 폴더 이름에 박아 CDN에서 그대로 immutable 로 서빙한다.
 * 배포 자격증명에 CloudFront invalidation 권한이 없어, 내용이 바뀌면 폴더 이름이 바뀌어야 한다.
 * 결과물은 `cdn-upload/` 아래에 쌓이고 업로드 명령을 마지막에 출력한다.
 *
 *   npx ts-node -T tools/build-old-baram-part-sheets.ts
 */

/** 썸네일 확대율. 도트가 살아 있으면서 시트가 지나치게 무거워지지 않는 선. */
const ZOOM = 2;
/** 격자 가로 칸 수. 팝업이 어떤 폭이든 이 값으로 칸 좌표를 계산한다. */
const COLUMNS = 12;
const PACK_PATH = path.resolve(
  process.cwd(),
  'src',
  'assets',
  'dat',
  'old-baram.obp',
);
const OUTPUT_ROOT = path.resolve(process.cwd(), 'cdn-upload');
const S3_PREFIX = 'data/old-baram';

interface SlotSheet {
  sheet: string;
  columns: number;
  cell: { width: number; height: number };
  /** 칸 순서대로의 아이템 번호. 무기·방패는 -1(없음)이 맨 앞에 온다. */
  ids: number[];
}

const renderer = new OldBaramRenderer();
renderer.load();
const options = renderer.getOptions();

/** 고르는 부위만 남기고 나머지는 기본값으로 둔 밑그림. */
const BASE_REQUEST: OldBaramRenderRequest = {
  head: options.parts.head[0]?.id ?? 0,
  headDye: 0,
  body: options.parts.body[0]?.id ?? 0,
  bodyDye: 0,
  weapon: -1,
  weaponDye: 0,
  shield: -1,
  shieldDye: 0,
  state: 'stand',
  direction: 1,
  frame: 0,
  colorFrame: 0,
  shadow: false,
  watermark: false,
  zoom: ZOOM,
};

function idsOf(slot: OldBaramSlotKey): number[] {
  const ids = options.parts[slot].map((item) => item.id);
  // 무기·방패는 벗은 모습도 골라야 한다.
  return slot === 'weapon' || slot === 'shield' ? [-1, ...ids] : ids;
}

function requestFor(slot: OldBaramSlotKey, id: number): OldBaramRenderRequest {
  const dyes = id === -1 ? [] : renderer.dyesOf(slot, id);
  return {
    ...BASE_REQUEST,
    [slot]: id,
    [`${slot}Dye`]: dyes[0] ?? 0,
  };
}

function buildSlot(slot: OldBaramSlotKey): { meta: SlotSheet; png: Buffer } {
  const ids = idsOf(slot);
  const { canvas, images } = renderer.renderSheet(
    ids.map((id) => requestFor(slot, id)),
  );

  const cellWidth = canvas.width * ZOOM;
  const cellHeight = canvas.height * ZOOM;
  const rows = Math.ceil(ids.length / COLUMNS);
  const sheet = new PNG({
    width: COLUMNS * cellWidth,
    height: rows * cellHeight,
  });
  sheet.data.fill(0);

  images.forEach((buffer, index) => {
    const cell = PNG.sync.read(buffer);
    const originX = (index % COLUMNS) * cellWidth;
    const originY = Math.floor(index / COLUMNS) * cellHeight;
    for (let y = 0; y < cell.height; y += 1) {
      const from = y * cell.width * 4;
      cell.data.copy(
        sheet.data,
        ((originY + y) * sheet.width + originX) * 4,
        from,
        from + cell.width * 4,
      );
    }
  });

  console.log(
    `${slot}: ${ids.length}칸 · 칸 ${cellWidth}x${cellHeight} · 시트 ${sheet.width}x${sheet.height}`,
  );

  return {
    meta: {
      sheet: `${slot}.png`,
      columns: COLUMNS,
      cell: { width: cellWidth, height: cellHeight },
      ids,
    },
    png: PNG.sync.write(sheet),
  };
}

const version = createHash('sha256')
  .update(fs.readFileSync(PACK_PATH))
  .update(`sheets:${ZOOM}:${COLUMNS}`)
  .digest('hex')
  .slice(0, 12);

const outputDir = path.join(OUTPUT_ROOT, S3_PREFIX, `parts-${version}`);
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const slots = {} as Record<OldBaramSlotKey, SlotSheet>;
let totalBytes = 0;

for (const slot of SLOT_KEYS) {
  const { meta, png } = buildSlot(slot);
  fs.writeFileSync(path.join(outputDir, meta.sheet), png);
  slots[slot] = meta;
  totalBytes += png.byteLength;
}

const index = { version, zoom: ZOOM, slots };
fs.writeFileSync(
  path.join(outputDir, 'index.json'),
  `${JSON.stringify(index, null, 2)}\n`,
  'utf8',
);

const relative = path.relative(process.cwd(), outputDir).replaceAll('\\', '/');
console.log(`\n시트 ${(totalBytes / 1024).toFixed(0)} KiB -> ${relative}`);
console.log('\n업로드:');
console.log(
  `  aws s3 sync "${relative}" "s3://barambook/${S3_PREFIX}/parts-${version}" ` +
    `--cache-control "public, max-age=31536000, immutable"`,
);
console.log(
  `\n업로드 후 프론트 src/app/old-render/partSheets.ts 의 SHEET_VERSION 을 '${version}' 으로 바꿀 것.`,
);
