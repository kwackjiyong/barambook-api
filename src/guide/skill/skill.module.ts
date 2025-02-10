import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SkillService } from './origin/skill.service';
import { SkillController } from './skill.controller';
import { SkillSchema } from './origin/skill.schema';
import { SkillFomulService } from './skill-fomul/skill-fomul.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'skills', schema: SkillSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'skill_fomuls', schema: SkillSchema }],
      'barambook',
    ),
  ],
  providers: [SkillService, SkillFomulService],
  controllers: [SkillController],
})
export class SkillModule {}
