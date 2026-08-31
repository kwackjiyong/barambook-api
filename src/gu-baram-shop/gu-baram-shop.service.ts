import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { guBaramItemIconUrl } from '../common/gu-baram-assets';
import { QueryGuBaramShopsDto } from './dto/query-gu-baram-shops.dto';
import {
  GU_BARAM_SHOP_SEARCH_MODES,
  GU_BARAM_SHOP_SORTS,
} from './gu-baram-shop.constants';
import { GuBaramShop } from './gu-baram-shop.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const LIST_FIELDS = {
  _id: 0,
  shopId: 1,
  label: 1,
  itemCount: 1,
  totalPrice: 1,
} as const;

@Injectable()
export class GuBaramShopService {
  constructor(
    @InjectModel('gu_baram_shops', 'barambook')
    private readonly shopModel: Model<GuBaramShop>,
  ) {}

  async findAll(query: QueryGuBaramShopsDto) {
    const filter: FilterQuery<GuBaramShop> = {};
    if (query.itemId !== undefined) filter['items.itemId'] = query.itemId;

    if (query.search) {
      const pattern = escapeRegExp(query.search);
      if (query.mode === 'item') {
        const exactId = /^\d+$/.test(query.search)
          ? Number(query.search)
          : null;
        filter.$or = [
          { 'items.name': { $regex: pattern, $options: 'i' } },
          ...(exactId !== null ? [{ 'items.itemId': exactId }] : []),
        ];
      } else {
        const exactId = /^\d+$/.test(query.search)
          ? Number(query.search)
          : null;
        filter.$or = [
          { label: { $regex: pattern, $options: 'i' } },
          ...(exactId !== null ? [{ shopId: exactId }] : []),
        ];
      }
    }

    const sorts: Record<
      QueryGuBaramShopsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { shopId: 1 },
      count: { itemCount: -1, shopId: 1 },
    };

    const skip = (query.page - 1) * query.limit;
    const [shops, total] = await Promise.all([
      this.shopModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select(LIST_FIELDS)
        .lean()
        .exec(),
      this.shopModel.countDocuments(filter).exec(),
    ]);

    return {
      shops,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(shopId: number) {
    const shop = await this.shopModel
      .findOne({ shopId })
      .select({ _id: 0 })
      .lean()
      .exec();
    if (!shop) throw new NotFoundException('구바람 상점을 찾을 수 없습니다.');
    return {
      ...shop,
      items: (shop.items ?? []).map((entry) => ({
        ...entry,
        iconUrl: guBaramItemIconUrl(entry.itemId),
      })),
    };
  }

  async getMetadata() {
    const [total, withMarkup] = await Promise.all([
      this.shopModel.countDocuments().exec(),
      // 배열에 점 표기 + $ne를 쓰면 "어느 원소도 100이 아닌" 문서만 걸린다.
      // 정가 물건과 섞여 있는 상점을 놓치므로 $elemMatch로 하나라도 다르면 센다.
      this.shopModel
        .countDocuments({ items: { $elemMatch: { multiplier: { $ne: 100 } } } })
        .exec(),
    ]);
    return {
      total,
      withMarkup,
      modes: GU_BARAM_SHOP_SEARCH_MODES,
      sorts: GU_BARAM_SHOP_SORTS,
    };
  }
}
