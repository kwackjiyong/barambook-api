import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryGuBaramItemsDto } from './dto/query-gu-baram-items.dto';
import { GuBaramItemService } from './gu-baram-item.service';

@Controller('gu-baram-items')
export class GuBaramItemController {
  constructor(private readonly service: GuBaramItemService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryGuBaramItemsDto,
  ) {
    return this.service.findAll(query);
  }

  @Get('metadata')
  getMetadata() {
    return this.service.getMetadata();
  }

  @Get(':itemId')
  findOne(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.service.findOne(itemId);
  }
}
