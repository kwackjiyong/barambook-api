import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryOldBaramItemsDto } from './dto/query-old-baram-items.dto';
import { OldBaramItemService } from './old-baram-item.service';

// 아이콘은 CDN(old-baram/item/{itemId}.png)에서 받는다. 여기서 파일로 서빙하지 않는다.
@Controller('old-baram-items')
export class OldBaramItemController {
  constructor(private readonly service: OldBaramItemService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryOldBaramItemsDto,
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
