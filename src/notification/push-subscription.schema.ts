import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 웹푸시 구독 정보. 브라우저(기기)마다 endpoint가 다르므로
// 한 회원이 여러 구독을 가질 수 있다.
@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscription extends Document {
  @Prop({ required: true, index: true })
  accountId: string;

  @Prop({ required: true, unique: true })
  endpoint: string;

  @Prop({ required: true })
  p256dh: string;

  @Prop({ required: true })
  auth: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PushSubscriptionSchema =
  SchemaFactory.createForClass(PushSubscription);
