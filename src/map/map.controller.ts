import { Controller, Get, Param } from '@nestjs/common';
import { MapService } from './origin/map.service';
import { MapPortal } from './portal/map.schema';
import { Map } from './origin/map.schema';
import { MapPortalService } from './portal/map.service';
import { MapCodeNameService } from './code-name/map.service';
import { MapCodeName } from './code-name/map.schema';

@Controller('map')
export class MapController {
  constructor(
    private readonly orginService: MapService,
    private readonly portalService: MapPortalService,
    private readonly codeNameService: MapCodeNameService,
  ) {}

  @Get()
  findMapGuides(): Promise<Map[]> {
    return this.orginService.findMapGuides();
  }

  @Get('portals')
  findMapPortals(): Promise<MapPortal[]> {
    return this.portalService.findMapPortals();
  }

  @Get('code-names')
  findMapCodeNames(): Promise<MapCodeName[]> {
    return this.codeNameService.findMapCodeNames();
  }

  @Get('code-names/:name')
  findNameByMapCodeNames(@Param('name') name: string): Promise<MapCodeName[]> {
    return this.codeNameService.findMapCodeNamesByName(name);
  }
}
