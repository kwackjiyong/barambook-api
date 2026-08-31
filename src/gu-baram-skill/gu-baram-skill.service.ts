import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { QueryGuBaramSkillsDto } from './dto/query-gu-baram-skills.dto';
import {
  GU_BARAM_SKILL_CATEGORIES,
  GU_BARAM_SKILL_INPUTS,
  GU_BARAM_SKILL_SORTS,
  guBaramSkillInputName,
} from './gu-baram-skill.constants';
import { GuBaramSkill } from './gu-baram-skill.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type SkillRow = { skillId: number; name: string; inputType: number };

function decorate<T extends SkillRow>(skill: T) {
  return { ...skill, inputLabel: guBaramSkillInputName(skill.inputType) };
}

const LIST_FIELDS = {
  _id: 0,
  skillId: 1,
  name: 1,
  inputType: 1,
  afterDeath: 1,
  buff: 1,
} as const;

@Injectable()
export class GuBaramSkillService {
  constructor(
    @InjectModel('gu_baram_skills', 'barambook')
    private readonly skillModel: Model<GuBaramSkill>,
  ) {}

  async findAll(query: QueryGuBaramSkillsDto) {
    const filter: FilterQuery<GuBaramSkill> = {};
    if (query.category === 'buff') filter.buff = true;
    if (query.category === 'death') filter.afterDeath = true;
    if (query.category === 'prompt') filter.message = { $ne: '' };
    if (query.inputType !== undefined) filter.inputType = query.inputType;

    if (query.search) {
      const exactId = /^\d+$/.test(query.search) ? Number(query.search) : null;
      filter.$or = [
        { name: { $regex: escapeRegExp(query.search), $options: 'i' } },
        ...(exactId !== null ? [{ skillId: exactId }] : []),
      ];
    }

    const sorts: Record<
      QueryGuBaramSkillsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { skillId: 1 },
      name: { name: 1, skillId: 1 },
    };

    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.skillModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select(LIST_FIELDS)
        .lean()
        .exec(),
      this.skillModel.countDocuments(filter).exec(),
    ]);

    return {
      skills: rows.map((skill) => decorate(skill as unknown as SkillRow)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(skillId: number) {
    const skill = await this.skillModel
      .findOne({ skillId })
      .select({ _id: 0 })
      .lean()
      .exec();
    if (!skill) throw new NotFoundException('구바람 스킬을 찾을 수 없습니다.');

    // 재사용 대기를 함께 쓰는 스킬. 0은 "묶이지 않음"이라 제외한다.
    const shareCooldown = skill.sharedCooldownId
      ? await this.skillModel
          .find({
            sharedCooldownId: skill.sharedCooldownId,
            skillId: { $ne: skillId },
          })
          .sort({ skillId: 1 })
          .limit(40)
          .select(LIST_FIELDS)
          .lean()
          .exec()
      : [];

    return {
      ...decorate(skill as unknown as SkillRow),
      shareCooldown: shareCooldown.map((row) =>
        decorate(row as unknown as SkillRow),
      ),
    };
  }

  async getMetadata() {
    const [total, buff, afterDeath] = await Promise.all([
      this.skillModel.countDocuments().exec(),
      this.skillModel.countDocuments({ buff: true }).exec(),
      this.skillModel.countDocuments({ afterDeath: true }).exec(),
    ]);
    const usedInputs = await this.skillModel.distinct('inputType').exec();
    return {
      total,
      buff,
      afterDeath,
      categories: GU_BARAM_SKILL_CATEGORIES,
      // 원본에 실제로 쓰인 것만 고를 수 있게 준다.
      inputs: GU_BARAM_SKILL_INPUTS.filter((entry) =>
        usedInputs.includes(entry.value),
      ),
      sorts: GU_BARAM_SKILL_SORTS,
    };
  }
}
