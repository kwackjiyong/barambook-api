import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema } from '../guide/item/origin/item.schema';
import { MarketAlertModule } from '../market-alert/market-alert.module';
import { GameMarketController } from './game-market.controller';
import {
  GameMarketIngestionSchema,
  GameMarketQuoteSchema,
} from './game-market.schema';
import { GameMarketService } from './game-market.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'game_market_quotes', schema: GameMarketQuoteSchema },
        { name: 'game_market_ingestions', schema: GameMarketIngestionSchema },
        { name: 'items', schema: ItemSchema },
      ],
      'barambook',
    ),
    // 새 매물이 꽂힐 때 시세 알림 조건과 대조하는 데 쓴다.
    MarketAlertModule,
  ],
  controllers: [GameMarketController],
  providers: [GameMarketService],
  exports: [GameMarketService],
})
export class GameMarketModule {}
