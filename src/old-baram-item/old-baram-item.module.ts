import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldBaramItemController } from './old-baram-item.controller';
import { OldBaramItemSchema } from './old-baram-item.schema';
import { OldBaramItemService } from './old-baram-item.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'old_baram_items', schema: OldBaramItemSchema }],
      'barambook',
    ),
  ],
  controllers: [OldBaramItemController],
  providers: [OldBaramItemService],
  exports: [OldBaramItemService],
})
export class OldBaramItemModule {}
