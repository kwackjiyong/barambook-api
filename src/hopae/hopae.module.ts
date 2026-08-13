import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatUserV4Schema } from '../chat-feed/chat-feed.schema';
import { UserV3Schema } from '../ranking/ranking.schema';
import { HopaeController } from './hopae.controller';
import { HopaeSearchSchema, UserV2Schema } from './hopae.schema';
import { HopaeService } from './hopae.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'v2_users', schema: UserV2Schema },
        { name: 'user_v3', schema: UserV3Schema },
        { name: 'v4_chat_users', schema: ChatUserV4Schema },
        { name: 'hopae_searches', schema: HopaeSearchSchema },
      ],
      'barambook',
    ),
  ],
  controllers: [HopaeController],
  providers: [HopaeService],
})
export class HopaeModule {}
