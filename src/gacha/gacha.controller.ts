import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryGachaGroupsDto } from './dto/query-gacha-groups.dto';
import { GachaService } from './gacha.service';

@Controller('gacha-groups')
export class GachaController {
  constructor(private readonly service: GachaService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryGachaGroupsDto,
  ) {
    return this.service.findAll(query);
  }

  @Get('metadata')
  getMetadata() {
    return this.service.getMetadata();
  }

  @Get('item-lookup')
  lookupItem(@Query('name') name?: string) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed || trimmed.length > 60) {
      throw new BadRequestException('name 쿼리가 필요합니다.');
    }
    return this.service.lookupItem(trimmed);
  }

  @Get(':groupId')
  findOne(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.service.findOne(groupId);
  }
}
