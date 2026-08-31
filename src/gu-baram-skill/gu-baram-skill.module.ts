import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuBaramSkillController } from './gu-baram-skill.controller';
import { GuBaramSkillSchema } from './gu-baram-skill.schema';
import { GuBaramSkillService } from './gu-baram-skill.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'gu_baram_skills', schema: GuBaramSkillSchema }],
      'barambook',
    ),
  ],
  controllers: [GuBaramSkillController],
  providers: [GuBaramSkillService],
  exports: [GuBaramSkillService],
})
export class GuBaramSkillModule {}
