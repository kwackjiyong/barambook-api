import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuBaramShopController } from './gu-baram-shop.controller';
import { GuBaramShopSchema } from './gu-baram-shop.schema';
import { GuBaramShopService } from './gu-baram-shop.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'gu_baram_shops', schema: GuBaramShopSchema }],
      'barambook',
    ),
  ],
  controllers: [GuBaramShopController],
  providers: [GuBaramShopService],
  exports: [GuBaramShopService],
})
export class GuBaramShopModule {}
