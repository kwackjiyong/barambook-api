import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatFeedController } from './chat-feed.controller';
import { ChatMessageSchema, ChatUserV4Schema } from './chat-feed.schema';
import { ChatFeedService } from './chat-feed.service';
import { GameMarketModule } from '../game-market/game-market.module';

@Module({
  imports: [
    GameMarketModule,
    MongooseModule.forFeature(
      [
        { name: 'chat_messages', schema: ChatMessageSchema },
        { name: 'v4_chat_users', schema: ChatUserV4Schema },
      ],
      'barambook',
    ),
  ],
  controllers: [ChatFeedController],
  providers: [ChatFeedService],
})
export class ChatFeedModule {}
