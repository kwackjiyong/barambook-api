import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MemberModule } from '../member/member.module';
import { NotificationModule } from '../notification/notification.module';
import { MarketAlertController } from './market-alert.controller';
import {
  MarketAlertNoticeSchema,
  MarketAlertRuleSchema,
} from './market-alert.schema';
import { MarketAlertService } from './market-alert.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'market_alert_rules', schema: MarketAlertRuleSchema },
        { name: 'market_alert_notices', schema: MarketAlertNoticeSchema },
      ],
      'barambook',
    ),
    // MemberSessionGuard 주입에 필요
    MemberModule,
    // 조건에 걸린 매물을 웹푸시로 보내는 데 쓴다.
    NotificationModule,
  ],
  controllers: [MarketAlertController],
  providers: [MarketAlertService],
  exports: [MarketAlertService],
})
export class MarketAlertModule {}
