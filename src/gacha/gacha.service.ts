import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { QueryGachaGroupsDto } from './dto/query-gacha-groups.dto';
import { GACHA_CATEGORIES, GACHA_CATEGORY_ORDER } from './gacha.constants';
import { GachaGroup } from './gacha.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 최신순 키. 원본 첫 행 Id가 있으면 그것, 아직 없는 문서는 groupId(분류 안에서는
// 이것도 대체로 추가 순서다)로 대신한다.
function recency(row: { firstId?: number; groupId: number }) {
  return row.firstId ?? row.groupId;
}

@Injectable()
export class GachaService {
  constructor(
    @InjectModel('gacha_groups', 'barambook')
    private readonly groupModel: Model<GachaGroup>,
  ) {}

  // 그룹이 60개 남짓이라 페이지네이션 없이 전부 준다.
  async findAll(query: QueryGachaGroupsDto) {
    const filter: FilterQuery<GachaGroup> = {};
    if (query.category) filter.category = query.category;
    if (query.search) {
      const regex = { $regex: escapeRegExp(query.search), $options: 'i' };
      filter.$or = [
        { name: regex },
        { 'items.name': regex },
        { 'pickupItems.name': regex },
        { 'bonusItems.name': regex },
      ];
    }

    const rows = await this.groupModel
      .find(filter)
      .select({
        _id: 0,
        groupId: 1,
        name: 1,
        category: 1,
        itemCount: 1,
        gachaLink: 1,
        firstId: 1,
        'pickupItems.name': 1,
        'bonusItems.name': 1,
      })
      .lean()
      .exec();

    // 분류 순서 → 같은 분류 안에서는 최신(원본 행 Id가 큰 것)이 먼저.
    rows.sort(
      (a, b) =>
        GACHA_CATEGORY_ORDER[a.category] - GACHA_CATEGORY_ORDER[b.category] ||
        recency(b) - recency(a),
    );

    return { groups: rows };
  }

  async findOne(groupId: number) {
    const group = await this.groupModel
      .findOne({ groupId })
      .select({ _id: 0 })
      .lean()
      .exec();
    if (!group) throw new NotFoundException('뽑기 그룹을 찾을 수 없습니다.');
    return group;
  }

  // 거래소 아이템 상세에서 "이 아이템이 나오는 상자"를 찾을 때 쓴다. 이름 완전 일치.
  async lookupItem(name: string) {
    const groups = await this.groupModel
      .find({
        $or: [
          { 'items.name': name },
          { 'pickupItems.name': name },
          { 'bonusItems.name': name },
        ],
      })
      .select({
        _id: 0,
        groupId: 1,
        name: 1,
        category: 1,
        firstId: 1,
        items: 1,
        pickupItems: 1,
        bonusItems: 1,
      })
      .lean()
      .exec();

    const matches = groups.map((group) => {
      const item = group.items.find((entry) => entry.name === name);
      const pickup = group.pickupItems?.find((entry) => entry.name === name);
      const bonus = group.bonusItems?.find((entry) => entry.name === name);
      return {
        groupId: group.groupId,
        name: group.name,
        category: group.category,
        firstId: group.firstId,
        via: item ? 'item' : pickup ? 'pickup' : 'bonus',
        chance: item?.chance ?? pickup?.chance ?? null,
      };
    });
    matches.sort(
      (a, b) =>
        GACHA_CATEGORY_ORDER[a.category as GachaGroup['category']] -
          GACHA_CATEGORY_ORDER[b.category as GachaGroup['category']] ||
        recency(b) - recency(a),
    );
    return { itemName: name, groups: matches };
  }

  async getMetadata() {
    const counts = await this.groupModel
      .aggregate<{
        _id: GachaGroup['category'];
        count: number;
      }>([{ $group: { _id: '$category', count: { $sum: 1 } } }])
      .exec();
    const byCategory = new Map(counts.map((row) => [row._id, row.count]));
    return {
      total: counts.reduce((sum, row) => sum + row.count, 0),
      categories: GACHA_CATEGORIES.map(({ value, label }) => ({
        value,
        label,
        count: byCategory.get(value) ?? 0,
      })),
    };
  }
}
