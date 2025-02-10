import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SkillFomul } from './skill-fomul.schema';

@Injectable()
export class SkillFomulService {
  constructor(
    @InjectModel('skill_fomuls', 'barambook')
    private skillFomulModel: Model<SkillFomul>,
  ) {}
  async findFomulSkill(): Promise<SkillFomul | null> {
    return await this.skillFomulModel.findOne().exec();
  }
}
