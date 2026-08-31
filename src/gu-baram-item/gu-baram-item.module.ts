import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuBaramItemController } from './gu-baram-item.controller';
import { GuBaramItemSchema } from './gu-baram-item.schema';
import { GuBaramItemService } from './gu-baram-item.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'gu_baram_items', schema: GuBaramItemSchema }],
      'barambook',
    ),
  ],
  controllers: [GuBaramItemController],
  providers: [GuBaramItemService],
  exports: [GuBaramItemService],
})
export class GuBaramItemModule {}
