import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryOldBaramMapsDto } from './dto/query-old-baram-maps.dto';
import { OldBaramMapService } from './old-baram-map.service';

@Controller('old-baram-maps')
export class OldBaramMapController {
  constructor(private readonly service: OldBaramMapService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryOldBaramMapsDto,
  ) {
    return this.service.findAll(query);
  }

  @Get('metadata')
  getMetadata() {
    return this.service.getMetadata();
  }

  @Get(':mapId')
  findOne(@Param('mapId', ParseIntPipe) mapId: number) {
    return this.service.findOne(mapId);
  }
}
