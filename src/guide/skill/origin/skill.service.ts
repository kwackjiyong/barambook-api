import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Skill } from './skill.schema';

@Injectable()
export class SkillService {
  constructor(
    @InjectModel('skills', 'barambook')
    private skillModel: Model<Skill>,
  ) {}
  findAllSkills(): Promise<Skill[]> {
    return this.skillModel.find();
  }
}
