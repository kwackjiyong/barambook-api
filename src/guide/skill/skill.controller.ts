import { Controller, Get } from '@nestjs/common';
import { SkillService } from './origin/skill.service';
import { Skill } from './origin/skill.schema';
import { SkillFomulService } from './skill-fomul/skill-fomul.service';
import { SkillFomul } from './skill-fomul/skill-fomul.schema';

@Controller('skill')
export class SkillController {
  constructor(
    private readonly service: SkillService,
    private readonly fomulService: SkillFomulService,
  ) {}

  @Get()
  findAllSkills(): Promise<Skill[]> {
    return this.service.findAllSkills();
  }

  @Get('fomul')
  findSkillFomuls(): Promise<SkillFomul | null> {
    return this.fomulService.findFomulSkill();
  }
}
