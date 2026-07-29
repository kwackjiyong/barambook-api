import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RankingRowDto, UpsertRankingDto } from './dto/upsert-ranking.dto';
import {
  RANKING_CLASS_BY_CODE,
  RankingClass,
  UserV3,
} from './ranking.schema';

/** 점수 랭킹 노출 상한. 게임 랭킹창이 1000위까지만 내려준다. */
export const RANKING_VISIBLE_LIMIT = 1000;
/** 이름이 정확히 일치하지 않을 때 돌려줄 부분일치 후보 수. */
const RANKING_SEARCH_CANDIDATE_LIMIT = 10;
/** 한 계정에서 함께 보여줄 다른 캐릭터 수 상한. */
const RANKING_SIBLING_LIMIT = 30;

export interface RankingSibling {
  name: string;
  class: string;
  rank: number;
  point: number | null;
}

export interface RankingSearchItem extends RankingSibling {
  mswId: string | null;
  /** 같은 msw ID(계정)로 묶인 다른 캐릭터들. 본인은 제외한다. */
  siblings: RankingSibling[];
  scannedAt: string;
}

export interface RankingUpsertResult {
  class: RankingClass;
  received: number;
  upserted: number;
  removed: number;
}

interface NormalizedRankingRow {
  Name: string;
  Class: RankingClass;
  Point: number | null;
  Rank: number;
  MswId: string | null;
  MswKey: string | null;
  MswDuplicateCount: number | null;
  ScannedAt: Date;
}

/**
 * msw ID 원문에서 계정 키와 중복 수를 분리한다.
 * 한 계정이 랭킹에 여러 캐릭터를 올리면 게임이 `abcd(2)` 처럼 소괄호로 중복 수를 붙여 내려준다.
 * 표기가 중괄호로 오는 경우도 있어 두 형태를 모두 받아 준다.
 */
export function parseMswId(rawMswId: string | null | undefined) {
  const mswId = (rawMswId ?? '').trim();

  if (!mswId) {
    return { mswId: null, mswKey: null, duplicateCount: null };
  }

  const matched = /^(.*?)\s*[({]\s*(\d+)\s*[)}]$/.exec(mswId);

  if (!matched) {
    return { mswId, mswKey: mswId.toLowerCase(), duplicateCount: null };
  }

  const key = matched[1].trim();
  return {
    mswId,
    mswKey: (key || mswId).toLowerCase(),
    duplicateCount: Number(matched[2]),
  };
}

/** 게임 표기가 `0123.45` 같은 0 패딩 문자열이라 숫자로 정규화해서 저장한다. */
function normalizePoint(rawPoint: RankingRowDto['point']): number | null {
  if (rawPoint === null || rawPoint === undefined) {
    return null;
  }

  const parsed =
    typeof rawPoint === 'number' ? rawPoint : Number(String(rawPoint).trim());

  return Number.isFinite(parsed) ? parsed : null;
}

/** 정규식 특수문자를 이스케이프해서 사용자 입력을 그대로 부분일치에 쓸 수 있게 한다. */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class RankingService {
  constructor(
    @InjectModel('user_v3', 'barambook')
    private readonly userV3Model: Model<UserV3>,
  ) {}

  async upsertRankings(payload: UpsertRankingDto): Promise<RankingUpsertResult> {
    const rankingClass = RANKING_CLASS_BY_CODE[payload.classCode];
    const scannedAt = new Date();
    const records = this.normalizeRows(payload.rows, rankingClass, scannedAt);

    if (records.length === 0) {
      return {
        class: rankingClass,
        received: payload.rows.length,
        upserted: 0,
        removed: 0,
      };
    }

    await this.userV3Model.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { Name: record.Name },
          update: { $set: record },
          upsert: true,
        },
      })),
    );

    const removed = payload.replaceClass
      ? await this.removeStaleClassRows(
          rankingClass,
          records.map((record) => record.Name),
        )
      : 0;

    return {
      class: rankingClass,
      received: payload.rows.length,
      upserted: records.length,
      removed,
    };
  }

  /**
   * 캐릭터 이름으로 점수 랭킹을 찾는다. 직업과 무관하게 이름만으로 조회하고,
   * 정확히 일치하는 이름이 없으면 부분일치 후보를 순위 순으로 돌려준다.
   */
  async searchByName(rawName: string): Promise<RankingSearchItem[]> {
    const name = rawName.trim();

    if (!name) {
      return [];
    }

    const exactMatches = await this.userV3Model
      .find({ Name: name })
      .sort({ Rank: 1 })
      .lean()
      .exec();

    const matches = exactMatches.length
      ? exactMatches
      : await this.userV3Model
          .find({ Name: { $regex: escapeRegExp(name), $options: 'i' } })
          .sort({ Rank: 1 })
          .limit(RANKING_SEARCH_CANDIDATE_LIMIT)
          .lean()
          .exec();

    if (matches.length === 0) {
      return [];
    }

    const siblingsByMswKey = await this.findSiblingsByMswKey(
      matches
        .map((match) => match.MswKey)
        .filter((mswKey): mswKey is string => Boolean(mswKey)),
    );

    return matches.map((match) => ({
      name: match.Name,
      class: match.Class,
      rank: match.Rank,
      point: match.Point ?? null,
      mswId: match.MswId ?? null,
      siblings: (siblingsByMswKey.get(match.MswKey ?? '') ?? [])
        .filter((sibling) => sibling.name !== match.Name)
        .slice(0, RANKING_SIBLING_LIMIT),
      scannedAt: new Date(match.ScannedAt).toISOString(),
    }));
  }

  private normalizeRows(
    rows: RankingRowDto[],
    rankingClass: RankingClass,
    scannedAt: Date,
  ): NormalizedRankingRow[] {
    const byName = new Map<string, NormalizedRankingRow>();

    for (const row of rows) {
      const name = (row.name ?? '').trim();

      if (!name || !Number.isFinite(row.rank) || row.rank < 1) {
        continue;
      }

      const { mswId, mswKey, duplicateCount } = parseMswId(row.mswId);

      // 같은 배치에 같은 이름이 두 번 오면 상위 순위를 남긴다.
      const existing = byName.get(name);
      if (existing && existing.Rank <= row.rank) {
        continue;
      }

      byName.set(name, {
        Name: name,
        Class: rankingClass,
        Point: normalizePoint(row.point),
        Rank: row.rank,
        MswId: mswId,
        MswKey: mswKey,
        MswDuplicateCount: duplicateCount,
        ScannedAt: scannedAt,
      });
    }

    return [...byName.values()];
  }

  /** 이번 배치에 없는 같은 직업 행을 지운다. 순위 밖으로 밀려난 캐릭터 정리용. */
  private async removeStaleClassRows(
    rankingClass: RankingClass,
    keptNames: string[],
  ) {
    const result = await this.userV3Model
      .deleteMany({ Class: rankingClass, Name: { $nin: keptNames } })
      .exec();

    return result.deletedCount ?? 0;
  }

  private async findSiblingsByMswKey(mswKeys: string[]) {
    const uniqueKeys = [...new Set(mswKeys)];
    const siblingsByMswKey = new Map<string, RankingSibling[]>();

    if (uniqueKeys.length === 0) {
      return siblingsByMswKey;
    }

    const rows = await this.userV3Model
      .find({ MswKey: { $in: uniqueKeys } })
      .sort({ Rank: 1 })
      .lean()
      .exec();

    for (const row of rows) {
      const mswKey = row.MswKey;

      if (!mswKey) {
        continue;
      }

      const siblings = siblingsByMswKey.get(mswKey) ?? [];
      siblings.push({
        name: row.Name,
        class: row.Class,
        rank: row.Rank,
        point: row.Point ?? null,
      });
      siblingsByMswKey.set(mswKey, siblings);
    }

    return siblingsByMswKey;
  }
}
