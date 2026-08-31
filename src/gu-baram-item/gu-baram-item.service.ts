import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { guBaramItemIconUrl } from '../common/gu-baram-assets';
import { QueryGuBaramItemsDto } from './dto/query-gu-baram-items.dto';
import {
  GU_BARAM_GENDERS,
  GU_BARAM_ITEM_GROUPS,
  GU_BARAM_ITEM_SORTS,
  GU_BARAM_JOBS,
  guBaramItemGroupName,
  guBaramItemTypeName,
} from './gu-baram-item.constants';
import { GuBaramItem } from './gu-baram-item.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type ItemRow = {
  itemId: number;
  name: string;
  group: string;
  type: number;
  hasIcon: boolean;
};

function decorate<T extends ItemRow>(item: T) {
  return {
    ...item,
    groupLabel: guBaramItemGroupName(item.group),
    typeLabel: guBaramItemTypeName(item.type),
    iconUrl: item.hasIcon ? guBaramItemIconUrl(item.itemId) : null,
  };
}

const LIST_FIELDS = {
  _id: 0,
  itemId: 1,
  name: 1,
  group: 1,
  type: 1,
  levelLimit: 1,
  jobLimit: 1,
  price: 1,
  stats: 1,
  hasIcon: 1,
} as const;

@Injectable()
export class GuBaramItemService {
  constructor(
    @InjectModel('gu_baram_items', 'barambook')
    private readonly itemModel: Model<GuBaramItem>,
  ) {}

  async findAll(query: QueryGuBaramItemsDto) {
    const filter: FilterQuery<GuBaramItem> = {};
    if (query.group) filter.group = query.group;
    // 직업 제한 없음(0)은 어느 직업으로 걸러도 함께 보여 준다.
    if (query.job) filter.jobLimit = { $in: [0, query.job] };
    if (query.sold) filter.shopCount = { $gt: 0 };

    if (query.search) {
      const exactId = /^\d+$/.test(query.search) ? Number(query.search) : null;
      const pattern = escapeRegExp(query.search);
      filter.$or = [
        { name: { $regex: pattern, $options: 'i' } },
        { description: { $regex: pattern, $options: 'i' } },
        ...(exactId !== null ? [{ itemId: exactId }] : []),
      ];
    }

    const sorts: Record<
      QueryGuBaramItemsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { itemId: 1 },
      name: { name: 1, itemId: 1 },
      level: { levelLimit: -1, itemId: 1 },
      price: { price: -1, itemId: 1 },
    };

    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select(LIST_FIELDS)
        .lean()
        .exec(),
      this.itemModel.countDocuments(filter).exec(),
    ]);

    return {
      items: rows.map((item) => decorate(item as unknown as ItemRow)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(itemId: number) {
    const item = await this.itemModel
      .findOne({ itemId })
      .select({ _id: 0 })
      .lean()
      .exec();
    if (!item) throw new NotFoundException('구바람 아이템을 찾을 수 없습니다.');
    return decorate(item as unknown as ItemRow);
  }

  async getMetadata() {
    const [total, withIcon, sold] = await Promise.all([
      this.itemModel.countDocuments().exec(),
      this.itemModel.countDocuments({ hasIcon: true }).exec(),
      this.itemModel.countDocuments({ shopCount: { $gt: 0 } }).exec(),
    ]);
    return {
      total,
      withIcon,
      sold,
      groups: GU_BARAM_ITEM_GROUPS,
      jobs: GU_BARAM_JOBS,
      genders: GU_BARAM_GENDERS,
      sorts: GU_BARAM_ITEM_SORTS,
    };
  }
}
