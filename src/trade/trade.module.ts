import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MemberModule } from '../member/member.module';
import { TradeController } from './trade.controller';
import { TradeListingSchema } from './trade.schema';
import { TradeService } from './trade.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'trade_listings', schema: TradeListingSchema }],
      'barambook',
    ),
    MemberModule,
  ],
  controllers: [TradeController],
  providers: [TradeService],
})
export class TradeModule {}
