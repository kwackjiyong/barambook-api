import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema } from '../guide/item/origin/item.schema';
import { MemberModule } from '../member/member.module';
import { TradeController } from './trade.controller';
import { TradeListingSchema } from './trade.schema';
import { TradeService } from './trade.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'trade_listings', schema: TradeListingSchema },
        { name: 'items', schema: ItemSchema },
      ],
      'barambook',
    ),
    MemberModule,
  ],
  controllers: [TradeController],
  providers: [TradeService],
})
export class TradeModule {}
