import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldBaramMobController } from './old-baram-mob.controller';
import { OldBaramMobSchema } from './old-baram-mob.schema';
import { OldBaramMobService } from './old-baram-mob.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'old_baram_mobs', schema: OldBaramMobSchema }],
      'barambook',
    ),
  ],
  controllers: [OldBaramMobController],
  providers: [OldBaramMobService],
  exports: [OldBaramMobService],
})
export class OldBaramMobModule {}
