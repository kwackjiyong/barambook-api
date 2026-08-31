import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuBaramMobController } from './gu-baram-mob.controller';
import { GuBaramMobSchema } from './gu-baram-mob.schema';
import { GuBaramMobService } from './gu-baram-mob.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'gu_baram_mobs', schema: GuBaramMobSchema }],
      'barambook',
    ),
  ],
  controllers: [GuBaramMobController],
  providers: [GuBaramMobService],
  exports: [GuBaramMobService],
})
export class GuBaramMobModule {}
