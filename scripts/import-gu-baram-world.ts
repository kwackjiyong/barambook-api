// "(구) 바람의나라 | 흑부엉"(Baram1996) 월드 원본에서 뽑아 둔 표를 로컬 DB에 적재한다.
//
//   pnpm import:gu-baram-world <rawdata 디렉터리> [--only=mob,item,skill,shop] [--images=<manifest.json>]
//
// 입력은 barambook-render-app의 extract-baram1996-rawdata.mjs 결과다.
// 옛날바람과 달리 MSW DataSet이 아니라 Lua 상수 테이블을 푼 것이라
// `{ "1": { "Name": "다람쥐", ... } }`처럼 번호를 키로 하는 객체다.
// 뽑는 법은 barambook-render-app/docs/baram1996-world-data.md에 있다.
//
// --images는 barambook의 prepare-gu-baram-cdn-assets.mjs가 남긴 매니페스트다.
// 어느 번호에 그림이 올라갔는지 알려 준다(몬스터 786 · 아이템 1,840).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Model, createConnection } from 'mongoose';
import * as dotenv from 'dotenv';
import {
  GuBaramMob,
  GuBaramMobSchema,
} from '../src/gu-baram-mob/gu-baram-mob.schema';
import {
  GuBaramItem,
  GuBaramItemSchema,
} from '../src/gu-baram-item/gu-baram-item.schema';
import {
  GuBaramSkill,
  GuBaramSkillSchema,
} from '../src/gu-baram-skill/gu-baram-skill.schema';
import {
  GuBaramShop,
  GuBaramShopSchema,
} from '../src/gu-baram-shop/gu-baram-shop.schema';
import { guBaramItemGroupName } from '../src/gu-baram-item/gu-baram-item.constants';

dotenv.config();

const sourceDirectory = process.argv[2];
if (!sourceDirectory) {
  throw new Error(
    '사용법: pnpm import:gu-baram-world <rawdata 디렉터리> [--only=mob,item,skill,shop] [--images=<manifest.json>]',
  );
}

const flags = process.argv.slice(3);
const onlyOption = flags.find((argument) => argument.startsWith('--only='));
const only = onlyOption
  ? new Set(onlyOption.slice('--only='.length).split(','))
  : null;
const wants = (name: string) => !only || only.has(name);

const imagesOption = flags.find((argument) => argument.startsWith('--images='));
const imageManifestPath = imagesOption
  ? resolve(imagesOption.slice('--images='.length))
  : null;

type Row = Record<string, unknown>;
type Table = Record<string, Row>;

const cache = new Map<string, Table>();
function table(name: string): Table {
  const cached = cache.get(name);
  if (cached) return cached;
  const path = resolve(sourceDirectory, name + '.json');
  if (!existsSync(path)) {
    throw new Error(
      name +
        '.json이 없습니다. extract-baram1996-rawdata.mjs로 먼저 뽑아 주세요.',
    );
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Table;
  cache.set(name, parsed);
  return parsed;
}

const imageManifest: { monsters?: number[]; items?: number[] } =
  imageManifestPath && existsSync(imageManifestPath)
    ? (JSON.parse(readFileSync(imageManifestPath, 'utf8')) as {
        monsters?: number[];
        items?: number[];
      })
    : {};
const mobImages = new Set(imageManifest.monsters ?? []);
const itemImages = new Set(imageManifest.items ?? []);

const num = (value: unknown) => (typeof value === 'number' ? value : 0);
const str = (value: unknown) => (typeof value === 'string' ? value : '');

// ── 아이템 능력치 ────────────────────────────────────────────────────────────
// 원본에 수치 칸이 없다. 게임이 그대로 찍어 주는 툴팁 글을 줄마다 읽는다.
// 이름표에 오타가 섞여 있어(`마력치  상승`, `민 상승`, `재색력`) 느슨하게 잡는다.

type StatKey =
  | 'armor'
  | 'hit'
  | 'damage'
  | 'hp'
  | 'mp'
  | 'str'
  | 'dex'
  | 'int'
  | 'regen'
  | 'magicDefense'
  | 'damageReduction';

const STAT_RULES: [StatKey, RegExp][] = [
  ['armor', /무장:\s*\+?(-?\d+)/],
  ['hit', /Hit:\s*\+?(-?\d+)/],
  ['damage', /Dam:\s*\+?(-?\d+)/],
  ['hp', /체력(?:치)?\s*상승:\s*\+?(-?\d+)|체력\s*\+(-?\d+)/],
  ['mp', /마력치?\s*상승:\s*\+?(-?\d+)/],
  ['str', /힘\s*상승:\s*\+?(-?\d+)/],
  ['dex', /(?:민첩성|민)\s*상승:\s*\+?(-?\d+)/],
  ['int', /(?:지력|지)\s*상승:\s*\+?(-?\d+)/],
  ['regen', /(?:재생력|재색력)\s*(?:상승:)?\s*\+?(-?\d+)/],
  ['magicDefense', /마법방어(?:력)?\s*(?:상승:)?\s*\+?(-?\d+)/],
  ['damageReduction', /받는 데미지\s*(-?\d+)%\s*감소/],
];
const SMALL_DAMAGE = /S:\s*(-?\d+)m(-?\d+)/;
const LARGE_DAMAGE = /L:\s*(-?\d+)m(-?\d+)/;

function parseTooltip(tooltip: string) {
  const stats: Record<string, number> = {};
  const extraLines: string[] = [];
  // 원본은 진짜 줄바꿈이 아니라 역슬래시 n 두 글자로 저장돼 있다.
  const lines = tooltip
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    let matched = false;
    let rest = line;

    const small = rest.match(SMALL_DAMAGE);
    if (small) {
      stats.smallMin = Number(small[1]);
      stats.smallMax = Number(small[2]);
      matched = true;
      rest = rest.replace(SMALL_DAMAGE, ' ');
    }
    const large = rest.match(LARGE_DAMAGE);
    if (large) {
      stats.largeMin = Number(large[1]);
      stats.largeMax = Number(large[2]);
      matched = true;
      rest = rest.replace(LARGE_DAMAGE, ' ');
    }

    // 한 줄에 이름표가 여럿 오는 경우가 있다("무장: -3 Hit: 0 Dam: 0").
    for (const [key, pattern] of STAT_RULES) {
      const found = rest.match(pattern);
      if (!found) continue;
      matched = true;
      const value = found.slice(1).find((group) => group !== undefined);
      stats[key] = Number(value);
      rest = rest.replace(pattern, ' ');
    }

    if (!matched) extraLines.push(line);
  }

  // 0은 "값 없음"과 구분이 안 되고 화면에서도 뜻이 없어 버린다.
  for (const key of Object.keys(stats)) {
    if (stats[key] === 0) delete stats[key];
  }
  return { stats, extraLines };
}

// ── 만들기 ───────────────────────────────────────────────────────────────────

const ITEM_TABLES: [string, string][] = [
  ['CRawDataWeaponItem', 'weapon'],
  ['CRawDataArmorItem', 'armor'],
  ['CRawDataHelmetItem', 'helmet'],
  ['CRawDataShieldItem', 'shield'],
  ['CRawDataAccessoryItem', 'accessory'],
  ['CRawDataConsumableItem', 'consumable'],
  ['CRawDataScriptableItem', 'scriptable'],
  ['CRawDataEtcItem', 'etc'],
];

/** 상점이 파는 아이템 수를 아이템 쪽에도 넣어 둔다. 매번 조인하지 않으려는 것이다. */
function shopCounts() {
  const counts = new Map<number, number>();
  for (const row of Object.values(table('RawDataShop'))) {
    const ids = (row.ResItemIds as number[]) ?? [];
    for (const itemId of ids) counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }
  return counts;
}

function buildMobs() {
  return Object.entries(table('CRawDataMonster')).map(([id, row]) => {
    const mobId = Number(id);
    return {
      mobId,
      name: str(row.Name),
      maxHp: num(row.HP),
      bodyId: num(row.BodyId),
      dye: num(row.Dye),
      hasImage: mobImages.has(mobId),
    };
  });
}

function buildItems() {
  const counts = shopCounts();
  const documents: Record<string, unknown>[] = [];
  for (const [name, group] of ITEM_TABLES) {
    for (const [id, row] of Object.entries(table(name))) {
      const itemId = Number(id);
      const { stats, extraLines } = parseTooltip(str(row.Tooltip));
      documents.push({
        itemId,
        name: str(row.Name),
        group,
        type: num(row.Type),
        unique: row.IsUnique === true,
        maxCount: num(row.MaxCount),
        maxDurability: num(row.MaxDurability),
        price: num(row.Price),
        levelLimit: num(row.LevelLimit),
        jobLimit: num(row.JobLimit),
        jobLevelLimit: num(row.JobLevelLimit),
        genderLimit: num(row.GenderLimit),
        strLimit: num(row.StrLimit),
        dexLimit: num(row.DexLimit),
        intLimit: num(row.IntLimit),
        canTrade: row.CanTrade !== false,
        canRepair: row.CanRepair !== false,
        description: str(row.Desc),
        extraLines,
        stats,
        shopCount: counts.get(itemId) ?? 0,
        hasIcon: itemImages.has(itemId),
      });
    }
  }
  return documents.sort((a, b) => (a.itemId as number) - (b.itemId as number));
}

function buildSkills() {
  const buffIds = new Set(
    Object.keys(table('CRawDataBuffSkillEffect')).map(Number),
  );
  return Object.entries(table('CRawDataSkill')).map(([id, row]) => {
    const skillId = Number(id);
    const inputType = num(row.InputType);
    return {
      skillId,
      name: str(row.Name),
      inputType,
      // DIE_INPUT(8) · DIE_TARGET(9) · DIE_JUST_NOW(12)
      afterDeath: [8, 9, 12].includes(inputType),
      sharedCooldownId: num(row.SharedCooldownId),
      castIntervalTick: num(row.CastIntervalTick),
      castScript: str(row.CastScript),
      message: str(row.Message),
      buff: buffIds.has(skillId),
    };
  });
}

/** 파는 물건의 구성으로 상점 성격을 붙인다. 한 부위가 6할을 넘으면 그 부위 상점이다. */
function shopLabel(groups: string[]) {
  if (groups.length === 0) return '빈 상점';
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group, (counts.get(group) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  const [topGroup, topCount] = ranked[0];
  if (topCount / groups.length >= 0.6) {
    return guBaramItemGroupName(topGroup) + ' 상점';
  }
  return (
    ranked
      .slice(0, 2)
      .map(([group]) => guBaramItemGroupName(group))
      .join('·') + ' 상점'
  );
}

function buildShops() {
  const itemById = new Map(
    buildItems().map((item) => [item.itemId as number, item]),
  );
  return Object.entries(table('RawDataShop')).map(([id, row]) => {
    const multipliers = (row.PriceMultiplier as Record<string, number>) ?? {};
    const ids = (row.ResItemIds as number[]) ?? [];
    const items = ids.map((itemId) => {
      const item = itemById.get(itemId);
      const multiplier = Number(multipliers[itemId] ?? 100);
      return {
        itemId,
        name: item ? (item.name as string) : undefined,
        group: item ? (item.group as string) : undefined,
        multiplier,
        price: Math.round((((item?.price as number) ?? 0) * multiplier) / 100),
      };
    });
    const known = items.filter((entry) => entry.name !== undefined);
    return {
      shopId: Number(id),
      label: shopLabel(known.map((entry) => entry.group as string)),
      itemCount: items.length,
      missingCount: items.length - known.length,
      totalPrice: items.reduce((sum, entry) => sum + entry.price, 0),
      items,
    };
  });
}

// ── 적재 ─────────────────────────────────────────────────────────────────────

async function load(
  // 스키마마다 문서 모양이 달라 여기서는 모델 타입을 좁히지 않는다.
  // 넣는 값의 모양은 build*()가 스키마에 맞춰 만든다.
  model: Model<any>,
  documents: Record<string, unknown>[],
  key: string,
  label: string,
) {
  if (documents.length === 0) {
    console.log(label + ': 넣을 것이 없습니다');
    return;
  }
  await model.createCollection().catch(() => undefined);
  await model.syncIndexes();
  // 500개씩 나눠 upsert한다. 다시 돌려도 같은 결과가 되도록 replaceOne을 쓴다.
  for (let start = 0; start < documents.length; start += 500) {
    const slice = documents.slice(start, start + 500);
    await model.bulkWrite(
      slice.map((document) => ({
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
  console.log('원본: ' + resolve(sourceDirectory));
  if (imageManifestPath) {
    console.log(
      '이미지 매니페스트: 몬스터 ' +
        mobImages.size +
        ' · 아이템 ' +
        itemImages.size,
    );
  } else {
    console.log(
      '이미지 매니페스트 없음 — hasImage/hasIcon이 전부 false가 된다',
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
        connection.model<GuBaramMob>('gu_baram_mobs', GuBaramMobSchema),
        buildMobs(),
        'mobId',
        '몬스터',
      );
    }
    if (wants('item')) {
      await load(
        connection.model<GuBaramItem>('gu_baram_items', GuBaramItemSchema),
        buildItems(),
        'itemId',
        '아이템',
      );
    }
    if (wants('skill')) {
      await load(
        connection.model<GuBaramSkill>('gu_baram_skills', GuBaramSkillSchema),
        buildSkills(),
        'skillId',
        '스킬',
      );
    }
    if (wants('shop')) {
      await load(
        connection.model<GuBaramShop>('gu_baram_shops', GuBaramShopSchema),
        buildShops(),
        'shopId',
        '상점',
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
