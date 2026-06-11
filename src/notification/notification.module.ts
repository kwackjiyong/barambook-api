import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MemberModule } from '../member/member.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PushSubscriptionSchema } from './push-subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'push_subscriptions', schema: PushSubscriptionSchema }],
      'barambook',
    ),
    MemberModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
