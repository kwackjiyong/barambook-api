import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryGuBaramSkillsDto } from './dto/query-gu-baram-skills.dto';
import { GuBaramSkillService } from './gu-baram-skill.service';

@Controller('gu-baram-skills')
export class GuBaramSkillController {
  constructor(private readonly service: GuBaramSkillService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryGuBaramSkillsDto,
  ) {
    return this.service.findAll(query);
  }

  @Get('metadata')
  getMetadata() {
    return this.service.getMetadata();
  }

  @Get(':skillId')
  findOne(@Param('skillId', ParseIntPipe) skillId: number) {
    return this.service.findOne(skillId);
  }
}
