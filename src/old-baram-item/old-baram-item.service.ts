import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { oldBaramItemIconUrl } from '../common/old-baram-assets';
import { QueryOldBaramItemsDto } from './dto/query-old-baram-items.dto';
import {
  OLD_BARAM_GENDERS,
  OLD_BARAM_ITEM_TYPES,
  OLD_BARAM_JOBS,
  oldBaramItemTypeName,
} from './old-baram-item.constants';
import { OldBaramItem } from './old-baram-item.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class OldBaramItemService {
  constructor(
    @InjectModel('old_baram_items', 'barambook')
    private readonly itemModel: Model<OldBaramItem>,
  ) {}

  async findAll(query: QueryOldBaramItemsDto) {
    const filter: FilterQuery<OldBaramItem> = {};
    if (query.type !== undefined) filter.type = query.type;
    if (query.job !== undefined) filter.requiredJob = query.job;
    if (query.gender !== undefined) filter.requiredGender = query.gender;

    if (query.search) {
      const exactId = /^\d+$/.test(query.search) ? Number(query.search) : null;
      filter.$or = [
        { name: { $regex: escapeRegExp(query.search), $options: 'i' } },
        ...(exactId !== null ? [{ itemId: exactId }] : []),
      ];
    }

    const sorts: Record<
      QueryOldBaramItemsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { itemId: 1 },
      name: { name: 1, itemId: 1 },
      level: { requiredLevel: 1, itemId: 1 },
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select({
          _id: 0,
          itemId: 1,
          name: 1,
          type: 1,
          iconId: 1,
          maxQuantity: 1,
          maxDurability: 1,
          price: 1,
          requiredLevel: 1,
          requiredJob: 1,
          requiredGender: 1,
          description: 1,
          hasIcon: 1,
        })
        .lean()
        .exec(),
      this.itemModel.countDocuments(filter).exec(),
    ]);

    return {
      items: rows.map((item) => ({
        ...item,
        typeName: oldBaramItemTypeName(item.type),
        iconUrl: item.hasIcon ? oldBaramItemIconUrl(item.itemId) : null,
      })),
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
    if (!item)
      throw new NotFoundException('옛날바람 아이템을 찾을 수 없습니다.');
    return {
      ...item,
      typeName: oldBaramItemTypeName(item.type),
      iconUrl: item.hasIcon ? oldBaramItemIconUrl(item.itemId) : null,
    };
  }

  async getMetadata() {
    const total = await this.itemModel.countDocuments().exec();
    return {
      total,
      types: OLD_BARAM_ITEM_TYPES,
      jobs: OLD_BARAM_JOBS,
      genders: OLD_BARAM_GENDERS,
    };
  }
}
