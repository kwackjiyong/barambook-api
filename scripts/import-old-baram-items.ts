import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createConnection } from 'mongoose';
import * as dotenv from 'dotenv';
import {
  OldBaramItem,
  OldBaramItemSchema,
} from '../src/old-baram-item/old-baram-item.schema';

dotenv.config();

interface TableDump {
  columns: string[];
  rows: string[][];
}

type SourceRow = Record<string, string>;

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error(
    '사용법: pnpm import:old-baram-items <ItemInfo.json> [--icons=<아이콘 디렉터리>]',
  );
}

// 아이콘 파일은 CDN(old-baram/item/)으로 옮겨서 이 저장소에 두지 않는다.
// hasIcon은 아이콘을 뽑아 둔 디렉터리를 훑어서 정한다. 파일 이름은 두 가지다.
//   item-00007__사냥의조각__icon-1034__dye-00__<ruid>.png   추출 결과 그대로
//   00007.png                                              아이템 ID로만 추린 것
const iconOption = process.argv
  .slice(3)
  .find((argument) => argument.startsWith('--icons='));
const iconDirectory = resolve(
  iconOption
    ? iconOption.slice('--icons='.length)
    : '../barambook-render-app/analysis/old-baram-world-cache/item-icons-extracted/images-by-item',
);

const iconIds = new Set<number>();
if (existsSync(iconDirectory)) {
  for (const file of readdirSync(iconDirectory)) {
    const matched = file.match(/^item-(\d+)__/) ?? file.match(/^(\d+)\.png$/);
    if (matched) iconIds.add(Number(matched[1]));
  }
  console.log(`아이콘 ${iconIds.size}개: ${iconDirectory}`);
} else {
  console.warn(
    `아이콘 디렉터리가 없습니다: ${iconDirectory} · hasIcon을 모두 false로 둡니다`,
  );
}

function optionalNumber(value: string | undefined) {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toDocument(row: SourceRow) {
  const itemId = optionalNumber(row.Id);
  const iconId = optionalNumber(row.iconId);
  if (itemId === undefined || !row.name) {
    throw new Error(`필수 필드가 비어 있습니다: ${JSON.stringify(row)}`);
  }
  return {
    itemId,
    name: row.name,
    type: optionalNumber(row.type) ?? 0,
    iconId,
    avatarId: optionalNumber(row.avatarId),
    dye: optionalNumber(row.dye),
    maxQuantity: optionalNumber(row.maxquan),
    maxDurability: optionalNumber(row.maxdura),
    price: optionalNumber(row.price),
    requiredMight: optionalNumber(row.reqmight),
    requiredGender: optionalNumber(row.reqgender),
    requiredLevel: optionalNumber(row.reqlevel),
    requiredJob: optionalNumber(row.reqjob),
    requiredGrade: optionalNumber(row.reqgrade),
    onDead: optionalNumber(row.ondead),
    tradeable: row.trade === '1',
    storable: row.storage === '1',
    repairable: row.repair === '1',
    repairPrice: optionalNumber(row.repairprice),
    storagePrice: optionalNumber(row.storageprice),
    namingPrice: optionalNumber(row.namingprice),
    onUse: row.OnUse || undefined,
    description: row.desc || undefined,
    unitName: row.unitname || undefined,
    smallDamageMin: optionalNumber(row.smin),
    smallDamageMax: optionalNumber(row.smax),
    largeDamageMin: optionalNumber(row.lmin),
    largeDamageMax: optionalNumber(row.lmax),
    armorClass: optionalNumber(row.ac),
    maxHp: optionalNumber(row.MHP),
    maxMp: optionalNumber(row.MMP),
    hit: optionalNumber(row.hit),
    damage: optionalNumber(row.dam),
    might: optionalNumber(row.M),
    will: optionalNumber(row.W),
    grace: optionalNumber(row.G),
    regeneration: optionalNumber(row.hr),
    magicDefense: optionalNumber(row.md),
    swingSound: optionalNumber(row.swingsound),
    twoHanded: row.twohanded === '1',
    maxHpPercent: optionalNumber(row.MHPR),
    maxMpPercent: optionalNumber(row.MMPR),
    pdu: optionalNumber(row.pdu),
    hasIcon: iconIds.has(itemId),
  };
}

async function main() {
  const absolutePath = resolve(inputPath);
  const table = JSON.parse(readFileSync(absolutePath, 'utf8')) as TableDump;
  if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) {
    throw new Error('ItemInfo.json 형식이 올바르지 않습니다.');
  }
  const documents = table.rows.map((values) =>
    toDocument(
      Object.fromEntries(
        table.columns.map((column, index) => [column, values[index] ?? '']),
      ),
    ),
  );

  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const connection = await createConnection(
    process.env.MONGO_URL ?? 'mongodb://localhost:27017/info?authSource=admin',
    username && password ? { auth: { username, password } } : {},
  ).asPromise();
  const model = connection.model<OldBaramItem>(
    'old_baram_items',
    OldBaramItemSchema,
  );
  try {
    for (let index = 0; index < documents.length; index += 500) {
      const batch = documents.slice(index, index + 500);
      await model.bulkWrite(
        batch.map((document) => ({
          replaceOne: {
            filter: { itemId: document.itemId },
            replacement: document,
            upsert: true,
          },
        })),
        { ordered: false },
      );
      console.log(
        `${Math.min(index + batch.length, documents.length)}/${documents.length} 적재`,
      );
    }
    const iconCount = documents.filter((item) => item.hasIcon).length;
    console.log(
      `${basename(absolutePath)}: ${documents.length}개 완료 · 아이콘 ${iconCount}개`,
    );
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
