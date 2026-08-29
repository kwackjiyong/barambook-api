import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { oldBaramMobImageUrls } from '../common/old-baram-assets';
import { QueryOldBaramMobsDto } from './dto/query-old-baram-mobs.dto';
import {
  OLD_BARAM_MOB_SIZES,
  oldBaramMobSizeName,
} from './old-baram-mob.constants';
import { OldBaramMob } from './old-baram-mob.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type MobDocument = Partial<OldBaramMob> & {
  mobId: number;
  size: string;
  hasImage: boolean;
  imageKey?: string;
};

function decorate<T extends MobDocument>(mob: T) {
  const urls = mob.imageKey ? oldBaramMobImageUrls(mob.imageKey) : null;
  return {
    ...mob,
    sizeName: oldBaramMobSizeName(mob.size),
    imageUrl: urls?.imageUrl ?? null,
    sheetUrl: urls?.sheetUrl ?? null,
    sheetMetaUrl: urls?.sheetMetaUrl ?? null,
  };
}

@Injectable()
export class OldBaramMobService {
  constructor(
    @InjectModel('old_baram_mobs', 'barambook')
    private readonly mobModel: Model<OldBaramMob>,
  ) {}

  async findAll(query: QueryOldBaramMobsDto) {
    const filter: FilterQuery<OldBaramMob> = {};
    if (query.size) filter.size = query.size;
    if (query.spawned) filter['spawns.0'] = { $exists: true };
    if (query.caster) filter['spells.0'] = { $exists: true };

    if (query.search) {
      const exactId = /^\d+$/.test(query.search) ? Number(query.search) : null;
      filter.$or = [
        { name: { $regex: escapeRegExp(query.search), $options: 'i' } },
        ...(exactId !== null ? [{ mobId: exactId }] : []),
      ];
    }

    const sorts: Record<
      QueryOldBaramMobsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { mobId: 1 },
      name: { name: 1, mobId: 1 },
      exp: { exp: -1, mobId: 1 },
      hp: { maxHp: -1, mobId: 1 },
      ac: { armorClass: 1, mobId: 1 },
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.mobModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select({
          _id: 0,
          mobId: 1,
          name: 1,
          imageId: 1,
          dye: 1,
          maxHp: 1,
          exp: 1,
          armorClass: 1,
          size: 1,
          damageMin: 1,
          damageMax: 1,
          hasImage: 1,
          imageKey: 1,
          imageExact: 1,
          imageWidth: 1,
          imageHeight: 1,
        })
        .lean()
        .exec(),
      this.mobModel.countDocuments(filter).exec(),
    ]);

    return {
      mobs: rows.map((mob) => decorate(mob as unknown as MobDocument)),
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
    if (!mob)
      throw new NotFoundException('옛날바람 몬스터를 찾을 수 없습니다.');
    return decorate(mob as unknown as MobDocument);
  }

  async getMetadata() {
    const [total, withSpawn, withSpell, withImage] = await Promise.all([
      this.mobModel.countDocuments().exec(),
      this.mobModel.countDocuments({ 'spawns.0': { $exists: true } }).exec(),
      this.mobModel.countDocuments({ 'spells.0': { $exists: true } }).exec(),
      this.mobModel.countDocuments({ hasImage: true }).exec(),
    ]);
    return {
      total,
      withSpawn,
      withSpell,
      withImage,
      sizes: OLD_BARAM_MOB_SIZES,
    };
  }
}
