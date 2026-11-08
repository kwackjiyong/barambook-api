import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MswAnalyticsController } from './msw-analytics.controller';
import {
  MswDailySchema,
  MswDailyUserSchema,
  MswEventSchema,
  MswPlayerSchema,
} from './msw-analytics.schema';
import { MswAnalyticsService } from './msw-analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'msw_events', schema: MswEventSchema },
        { name: 'msw_players', schema: MswPlayerSchema },
        { name: 'msw_daily', schema: MswDailySchema },
        { name: 'msw_daily_users', schema: MswDailyUserSchema },
      ],
      'barambook',
    ),
  ],
  controllers: [MswAnalyticsController],
  providers: [MswAnalyticsService],
})
export class MswAnalyticsModule {}
