import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatFeedController } from './chat-feed.controller';
import { ChatMessageSchema } from './chat-feed.schema';
import { ChatFeedService } from './chat-feed.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'chat_messages', schema: ChatMessageSchema }],
      'barambook',
    ),
  ],
  controllers: [ChatFeedController],
  providers: [ChatFeedService],
})
export class ChatFeedModule {}
