import { Controller, Get, Param, Query } from '@nestjs/common';
import { MapService } from './origin/map.service';
import { MapPortal } from './portal/map.schema';
import { Map } from './origin/map.schema';
import { MapPortalService } from './portal/map.service';
import { MapCodeNameService } from './code-name/map.service';
import { MapCodeName } from './code-name/map.schema';
import { MapNaviService } from './navi/navi.service';

@Controller('map')
export class MapController {
  constructor(
    private readonly orginService: MapService,
    private readonly portalService: MapPortalService,
    private readonly codeNameService: MapCodeNameService,
    private readonly naviService: MapNaviService,
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

  @Get('navi')
  findNavigation(
    @Query('startName') startName: string,
    @Query('finishName') finishName: string,
  ) {
    return this.naviService.navigate({ startName, finishName });
  }
}
