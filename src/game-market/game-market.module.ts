import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemSchema } from '../guide/item/origin/item.schema';
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
  ],
  controllers: [GameMarketController],
  providers: [GameMarketService],
  exports: [GameMarketService],
})
export class GameMarketModule {}
