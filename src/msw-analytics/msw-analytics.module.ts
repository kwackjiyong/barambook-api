import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MswAnalyticsController } from './msw-analytics.controller';
import { MswEventSchema, MswPlayerSchema } from './msw-analytics.schema';
import { MswAnalyticsService } from './msw-analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'msw_events', schema: MswEventSchema },
        { name: 'msw_players', schema: MswPlayerSchema },
      ],
      'barambook',
    ),
  ],
  controllers: [MswAnalyticsController],
  providers: [MswAnalyticsService],
})
export class MswAnalyticsModule {}
