import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldBaramSpellController } from './old-baram-spell.controller';
import { OldBaramSpellSchema } from './old-baram-spell.schema';
import { OldBaramSpellService } from './old-baram-spell.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'old_baram_spells', schema: OldBaramSpellSchema }],
      'barambook',
    ),
  ],
  controllers: [OldBaramSpellController],
  providers: [OldBaramSpellService],
  exports: [OldBaramSpellService],
})
export class OldBaramSpellModule {}
