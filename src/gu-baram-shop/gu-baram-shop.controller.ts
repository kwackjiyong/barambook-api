import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { QueryGuBaramShopsDto } from './dto/query-gu-baram-shops.dto';
import { GuBaramShopService } from './gu-baram-shop.service';

@Controller('gu-baram-shops')
export class GuBaramShopController {
  constructor(private readonly service: GuBaramShopService) {}

  @Get()
  findAll(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryGuBaramShopsDto,
  ) {
    return this.service.findAll(query);
  }

  @Get('metadata')
  getMetadata() {
    return this.service.getMetadata();
  }

  @Get(':shopId')
  findOne(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.service.findOne(shopId);
  }
}
