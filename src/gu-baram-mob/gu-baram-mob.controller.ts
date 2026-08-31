import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryGuBaramMobsDto } from './dto/query-gu-baram-mobs.dto';
import { GuBaramMobService } from './gu-baram-mob.service';

@Controller('gu-baram-mobs')
export class GuBaramMobController {
  constructor(private readonly service: GuBaramMobService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryGuBaramMobsDto,
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
