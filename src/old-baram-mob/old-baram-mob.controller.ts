import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryOldBaramMobsDto } from './dto/query-old-baram-mobs.dto';
import { OldBaramMobService } from './old-baram-mob.service';

@Controller('old-baram-mobs')
export class OldBaramMobController {
  constructor(private readonly service: OldBaramMobService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryOldBaramMobsDto,
  ) {
    return this.service.findAll(query);
  }

  @Get('metadata')
  getMetadata() {
    return this.service.getMetadata();
  }

  @Get(':mobId')
  findOne(@Param('mobId', ParseIntPipe) mobId: number) {
    return this.service.findOne(mobId);
  }
}
