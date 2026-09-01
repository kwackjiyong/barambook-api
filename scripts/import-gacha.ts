// 클래식 월드 원본에서 뽑아 둔 Gacha·CashItem 표를 gacha_groups 컬렉션에 적재한다.
//
//   pnpm import:gacha ../barambook-render-app/analysis/classic-cache-20260828/game-data-extracted
//   pnpm import:gacha <디렉터리> --dry-run   # 적재 없이 결과만 확인
//
// 입력은 extract-world-datasets.mjs가 만든 { name, guid, columns, rows } JSON이다.
// 원본 한 행은 [Id, GroupId, ItemName, ItemCount, Rate, Memo]이고, 여기서
// 세 가지를 접는다.
//   - "<메모>_보너스" 그룹: 100% 확정 지급이라 본 그룹의 bonusItems로.
//   - 102xxx 픽업 풀: 짝이 되는 101xxx 문서의 pickupItems로.
//   - CashItem.GachaLink: UserExposureName이 메모와 같은 그룹에 붙인다.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConnection } from 'mongoose';
import * as dotenv from 'dotenv';
import { GachaGroup, GachaGroupSchema } from '../src/gacha/gacha.schema';

dotenv.config();

interface TableDump {
  columns: string[];
  rows: string[][];
}

const sourceDirectory = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!sourceDirectory) {
  throw new Error('사용법: pnpm import:gacha <game-data-extracted 디렉터리>');
}

function table(name: string): TableDump {
  const path = resolve(sourceDirectory, name + '.json');
  if (!existsSync(path)) {
    throw new Error(`${name}.json 이 없습니다: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as TableDump;
}

interface RawEntry {
  name: string;
  count: number;
  rate: number;
}

interface RawGroup {
  groupId: number;
  memos: string[];
  entries: RawEntry[];
}

function readGroups(): Map<number, RawGroup> {
  const gacha = table('Gacha');
  const index = Object.fromEntries(
    gacha.columns.map((column, at) => [column, at]),
  );
  const groups = new Map<number, RawGroup>();
  for (const row of gacha.rows) {
    const groupId = Number(row[index.GroupId]);
    if (!Number.isFinite(groupId)) continue;
    let group = groups.get(groupId);
    if (!group) {
      group = { groupId, memos: [], entries: [] };
      groups.set(groupId, group);
    }
    const memo = String(row[index.Memo] ?? '').trim();
    if (memo && !group.memos.includes(memo)) group.memos.push(memo);
    group.entries.push({
      name: String(row[index.ItemName] ?? '').trim(),
      count: Number(row[index.ItemCount]) || 1,
      rate: Number(row[index.Rate]) || 0,
    });
  }
  return groups;
}

function readGachaLinks(): Map<string, string> {
  const cash = table('CashItem');
  const index = Object.fromEntries(
    cash.columns.map((column, at) => [column, at]),
  );
  const links = new Map<string, string>();
  for (const row of cash.rows) {
    const exposure = String(row[index.UserExposureName] ?? '').trim();
    const link = String(row[index.GachaLink] ?? '').trim();
    if (exposure && link) links.set(exposure, link);
  }
  return links;
}

const categoryOf = (groupId: number, memo: string): GachaGroup['category'] => {
  if (groupId >= 100000 && groupId < 101000) return 'cash';
  if (groupId >= 101000 && groupId < 103000) return 'pickup';
  if (memo.includes('100위 보상')) return 'ranking';
  if (memo.includes('환기')) return 'monthly';
  return 'event';
};

function build() {
  const groups = readGroups();
  const links = readGachaLinks();

  // 접는 대상을 먼저 갈라낸다.
  const bonusByParentMemo = new Map<number, RawGroup>();
  const pickupByPair = new Map<number, RawGroup>();
  const mains: RawGroup[] = [];
  const memoByGroup = (group: RawGroup) => group.memos[0] ?? '';

  for (const group of groups.values()) {
    const memo = memoByGroup(group);
    if (memo.endsWith('_보너스')) {
      const parentMemo = memo.slice(0, -'_보너스'.length);
      const parent = [...groups.values()].find(
        (candidate) => memoByGroup(candidate) === parentMemo,
      );
      if (parent) {
        bonusByParentMemo.set(parent.groupId, group);
        continue;
      }
    }
    if (group.groupId >= 102000 && group.groupId < 103000) {
      pickupByPair.set(group.groupId - 1000, group);
      continue;
    }
    mains.push(group);
  }

  const toItems = (entries: RawEntry[]) => {
    const totalRate = entries.reduce((sum, entry) => sum + entry.rate, 0);
    const items = entries.map((entry) => ({
      name: entry.name,
      count: entry.count,
      rate: entry.rate,
      chance:
        totalRate > 0 ? Number(((entry.rate / totalRate) * 100).toFixed(6)) : 0,
    }));
    return { items, totalRate };
  };

  return mains.map((group) => {
    const memo = memoByGroup(group);
    const { items, totalRate } = toItems(group.entries);
    const bonus = bonusByParentMemo.get(group.groupId);
    const pickup = pickupByPair.get(group.groupId);
    const pickupBuilt = pickup ? toItems(pickup.entries) : null;

    // 픽업 상자는 메모가 전부 "픽업아이템"이라 픽업 대상 이름으로 짓는다.
    let name =
      pickupBuilt && pickupBuilt.items.length > 0
        ? `픽업 뽑기 — ${pickupBuilt.items.map((item) => item.name).join(' · ')}`
        : memo || `뽑기 그룹 ${group.groupId}`;
    // 청명의관문 100위 보상이 1막·2막 두 그룹인데 메모가 같다. 2막은 아이템에
    // [청명2] 접두가 붙어 있어 그걸로 갈라 적는다.
    if (memo === '청명의관문 100위 보상') {
      name += items.some((item) => item.name.startsWith('[청명2]'))
        ? ' (2막)'
        : ' (1막)';
    }

    return {
      groupId: group.groupId,
      name,
      memos: group.memos,
      category: categoryOf(group.groupId, memo),
      items,
      totalRate,
      itemCount: items.length,
      bonusItems: bonus
        ? bonus.entries.map((entry) => ({
            name: entry.name,
            count: entry.count,
          }))
        : [],
      pickupItems: pickupBuilt ? pickupBuilt.items : [],
      ...(pickup ? { pickupGroupId: pickup.groupId } : {}),
      ...(links.has(memo) ? { gachaLink: links.get(memo) } : {}),
    };
  });
}

async function main() {
  const documents = build();
  console.log(`그룹 ${documents.length}개 (보너스·픽업 풀 접음)`);
  for (const document of documents) {
    console.log(
      `  ${String(document.groupId).padStart(6)} [${document.category}] ${document.name}` +
        ` — 항목 ${document.itemCount}` +
        (document.bonusItems.length
          ? ` +보너스 ${document.bonusItems.length}`
          : '') +
        (document.pickupItems.length
          ? ` +픽업 ${document.pickupItems.length}`
          : '') +
        (document.gachaLink ? ' (공시 링크)' : ''),
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
    const model = connection.model<GachaGroup>(
      'gacha_groups',
      GachaGroupSchema,
    );
    await model.deleteMany({});
    await model.insertMany(documents, { ordered: true });
    console.log(`gacha_groups 적재 완료: ${documents.length}건`);
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
