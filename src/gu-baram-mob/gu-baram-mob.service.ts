import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { guBaramMobImageUrl } from '../common/gu-baram-assets';
import { QueryGuBaramMobsDto } from './dto/query-gu-baram-mobs.dto';
import {
  GU_BARAM_MOB_SORTS,
  GU_BARAM_MOB_TIERS,
} from './gu-baram-mob.constants';
import { GuBaramMob } from './gu-baram-mob.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type MobRow = {
  mobId: number;
  name: string;
  maxHp: number;
  bodyId?: number;
  dye?: number;
  hasImage: boolean;
};

// bodyId·dye는 사용자에게 뜻이 없는 내부 번호다. 응답에 담지 않고 그림 주소만 준다.
function decorate(mob: MobRow) {
  return {
    mobId: mob.mobId,
    name: mob.name,
    maxHp: mob.maxHp,
    hasImage: mob.hasImage,
    imageUrl: mob.hasImage ? guBaramMobImageUrl(mob.mobId) : null,
  };
}

const LIST_FIELDS = {
  _id: 0,
  mobId: 1,
  name: 1,
  maxHp: 1,
  hasImage: 1,
} as const;

@Injectable()
export class GuBaramMobService {
  constructor(
    @InjectModel('gu_baram_mobs', 'barambook')
    private readonly mobModel: Model<GuBaramMob>,
  ) {}

  async findAll(query: QueryGuBaramMobsDto) {
    const filter: FilterQuery<GuBaramMob> = {};

    const tier = GU_BARAM_MOB_TIERS.find((entry) => entry.value === query.tier);
    if (tier) {
      filter.maxHp = Number.isFinite(tier.max)
        ? { $gte: tier.min, $lt: tier.max }
        : { $gte: tier.min };
    }

    if (query.search) {
      const exactId = /^\d+$/.test(query.search) ? Number(query.search) : null;
      filter.$or = [
        { name: { $regex: escapeRegExp(query.search), $options: 'i' } },
        ...(exactId !== null ? [{ mobId: exactId }] : []),
      ];
    }

    const sorts: Record<
      QueryGuBaramMobsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { mobId: 1 },
      name: { name: 1, mobId: 1 },
      hpDesc: { maxHp: -1, mobId: 1 },
      hpAsc: { maxHp: 1, mobId: 1 },
    };

    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.mobModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select(LIST_FIELDS)
        .lean()
        .exec(),
      this.mobModel.countDocuments(filter).exec(),
    ]);

    return {
      mobs: rows.map((mob) => decorate(mob as unknown as MobRow)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(mobId: number) {
    const mob = await this.mobModel
      .findOne({ mobId })
      .select({ _id: 0 })
      .lean()
      .exec();
    if (!mob) throw new NotFoundException('구바람 몬스터를 찾을 수 없습니다.');

    // 색만 바꿔 낸 짝이 많아(흑룡·수룡·화룡…) 같은 그림을 쓰는 것을 함께 준다.
    const sameBody = await this.mobModel
      .find({ bodyId: mob.bodyId, mobId: { $ne: mobId } })
      .sort({ mobId: 1 })
      .limit(40)
      .select(LIST_FIELDS)
      .lean()
      .exec();

    return {
      ...decorate(mob as unknown as MobRow),
      sameBody: sameBody.map((row) => decorate(row as unknown as MobRow)),
    };
  }

  async getMetadata() {
    const [total, withImage] = await Promise.all([
      this.mobModel.countDocuments().exec(),
      this.mobModel.countDocuments({ hasImage: true }).exec(),
    ]);
    return {
      total,
      withImage,
      tiers: GU_BARAM_MOB_TIERS.map(({ value, label }) => ({ value, label })),
      sorts: GU_BARAM_MOB_SORTS,
    };
  }
}
