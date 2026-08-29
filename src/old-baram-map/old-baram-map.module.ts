import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldBaramMapController } from './old-baram-map.controller';
import { OldBaramMapSchema } from './old-baram-map.schema';
import { OldBaramMapService } from './old-baram-map.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'old_baram_maps', schema: OldBaramMapSchema }],
      'barambook',
    ),
  ],
  controllers: [OldBaramMapController],
  providers: [OldBaramMapService],
  exports: [OldBaramMapService],
})
export class OldBaramMapModule {}
