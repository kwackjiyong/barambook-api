import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { QueryOldBaramSpellsDto } from './dto/query-old-baram-spells.dto';
import {
  OLD_BARAM_JOBS,
  OLD_BARAM_SPELL_CATEGORIES,
} from './old-baram-spell.constants';
import { OldBaramSpell } from './old-baram-spell.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CATEGORY_FILTERS: Record<string, FilterQuery<OldBaramSpell>> = {
  learnable: { 'learn.0': { $exists: true } },
  mob: { mobOnly: true },
  other: { 'learn.0': { $exists: false }, mobOnly: false },
};

@Injectable()
export class OldBaramSpellService {
  constructor(
    @InjectModel('old_baram_spells', 'barambook')
    private readonly spellModel: Model<OldBaramSpell>,
  ) {}

  private baseFilter(query: QueryOldBaramSpellsDto) {
    const filter: FilterQuery<OldBaramSpell> = {};
    if (!query.includeInternal) filter.internal = false;
    if (query.category) Object.assign(filter, CATEGORY_FILTERS[query.category]);
    if (query.job !== undefined) filter.jobs = query.job;
    if (query.search) {
      filter.name = { $regex: escapeRegExp(query.search), $options: 'i' };
    }
    return filter;
  }

  async findAll(query: QueryOldBaramSpellsDto) {
    const filter = this.baseFilter(query);
    const sorts: Record<
      QueryOldBaramSpellsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { spellId: 1 },
      name: { name: 1, spellId: 1 },
      level: { minLevel: 1, spellId: 1 },
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.spellModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select({
          _id: 0,
          spellId: 1,
          name: 1,
          learn: 1,
          jobs: 1,
          minLevel: 1,
          negative: 1,
          curse: 1,
          internal: 1,
          castMode: 1,
          mobOnly: 1,
          castMessage: 1,
        })
        .lean()
        .exec(),
      this.spellModel.countDocuments(filter).exec(),
    ]);

    return {
      spells: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(spellId: number) {
    const spell = await this.spellModel
      .findOne({ spellId })
      .select({ _id: 0 })
      .lean()
      .exec();
    if (!spell)
      throw new NotFoundException('옛날바람 마법을 찾을 수 없습니다.');
    return spell;
  }

  async getMetadata() {
    const [total, learnable, mobOnly, internal] = await Promise.all([
      this.spellModel.countDocuments({ internal: false }).exec(),
      this.spellModel
        .countDocuments({ internal: false, 'learn.0': { $exists: true } })
        .exec(),
      this.spellModel.countDocuments({ internal: false, mobOnly: true }).exec(),
      this.spellModel.countDocuments({ internal: true }).exec(),
    ]);
    return {
      total,
      learnable,
      mobOnly,
      internal,
      jobs: OLD_BARAM_JOBS.map(({ value, label }) => ({ value, label })),
      categories: OLD_BARAM_SPELL_CATEGORIES,
    };
  }
}
