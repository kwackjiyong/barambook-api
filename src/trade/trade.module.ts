import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema } from '../guide/item/origin/item.schema';
import { MemberModule } from '../member/member.module';
import { NotificationModule } from '../notification/notification.module';
import { TradeController } from './trade.controller';
import {
  TradeListingSchema,
  TradeMessageSchema,
  TradeThreadSchema,
} from './trade.schema';
import { TradeService } from './trade.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'trade_listings', schema: TradeListingSchema },
        { name: 'trade_messages', schema: TradeMessageSchema },
        { name: 'trade_threads', schema: TradeThreadSchema },
        { name: 'items', schema: ItemSchema },
      ],
      'barambook',
    ),
    MemberModule,
    NotificationModule,
  ],
  controllers: [TradeController],
  providers: [TradeService],
})
export class TradeModule {}
