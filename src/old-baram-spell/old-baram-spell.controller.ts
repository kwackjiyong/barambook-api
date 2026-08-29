import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryOldBaramSpellsDto } from './dto/query-old-baram-spells.dto';
import { OldBaramSpellService } from './old-baram-spell.service';

@Controller('old-baram-spells')
export class OldBaramSpellController {
  constructor(private readonly service: OldBaramSpellService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryOldBaramSpellsDto,
  ) {
    return this.service.findAll(query);
  }

  @Get('metadata')
  getMetadata() {
    return this.service.getMetadata();
  }

  @Get(':spellId')
  findOne(@Param('spellId', ParseIntPipe) spellId: number) {
    return this.service.findOne(spellId);
  }
}
