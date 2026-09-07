import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatUserV4Schema } from '../chat-feed/chat-feed.schema';
import { MemberModule } from '../member/member.module';
import { UserV3Schema } from '../ranking/ranking.schema';
import { HopaeController } from './hopae.controller';
import { HopaeDeniedRequestSchema } from './hopae-denial.schema';
import { HopaeDenialService } from './hopae-denial.service';
import { HopaeSearchSchema, UserV2Schema } from './hopae.schema';
import { HopaeService } from './hopae.service';
import { HopaeTokenGuard } from './hopae-token.guard';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'v2_users', schema: UserV2Schema },
        { name: 'user_v3', schema: UserV3Schema },
        { name: 'v4_chat_users', schema: ChatUserV4Schema },
        { name: 'hopae_searches', schema: HopaeSearchSchema },
        { name: 'hopae_denied_requests', schema: HopaeDeniedRequestSchema },
      ],
      'barambook',
    ),
    // 거부 목록(/hopae/denied)은 운영자만 본다.
    MemberModule,
  ],
  controllers: [HopaeController],
  providers: [HopaeService, HopaeDenialService, HopaeTokenGuard],
})
export class HopaeModule {}
