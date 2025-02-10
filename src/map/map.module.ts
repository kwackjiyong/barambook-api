import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MapCodeNameService } from './code-name/map.service';
import { MapPortalService } from './portal/map.service';
import { MapService } from './origin/map.service';
import { MapSchema } from './origin/map.schema';
import { MapPortalSchema } from './portal/map.schema';
import { MapController } from './map.controller';
import { MapCodeNameSchema } from './code-name/map.schema';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'map_guides', schema: MapSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'map_portals', schema: MapPortalSchema }],
      'barambook',
    ),
    MongooseModule.forFeature(
      [{ name: 'map_code_names', schema: MapCodeNameSchema }],
      'barambook',
    ),
  ],
  providers: [MapService, MapPortalService, MapCodeNameService],
  controllers: [MapController],
})
export class MapModule {}
