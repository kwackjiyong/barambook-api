import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { HopaeTokenCheck } from './hopae-token';

export type HopaeDenialReason = Exclude<HopaeTokenCheck, 'ok'>;

/**
 * 페이지 토큰 없이(또는 틀린 토큰으로) 호패 검색을 두드린 요청 한 건.
 *
 * 수집기 판별용이라 IP 를 해시하지 않고 그대로 둔다(검색 기록 `hopae_searches` 와 다른 점).
 * 운영자 화면에서 IP 별로 묶어 보며, 90일이 지나면 자동으로 지운다.
 */
@Schema({
  collection: 'hopae_denied_requests',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class HopaeDeniedRequest extends Document {
  /** 신뢰하는 프록시 기준의 실제 클라이언트 IP(clientIpOf). */
  @Prop({ type: String, required: true })
  ip: string;

  /** X-Forwarded-For 전체 사슬. 프록시 홉 설정이 맞는지 대조할 때 본다. */
  @Prop({ type: String })
  forwardedFor?: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    enum: ['missing', 'invalid', 'expired', 'mismatch'],
  })
  reason: HopaeDenialReason;

  @Prop({ type: String })
  userAgent?: string;

  @Prop({ type: String })
  referer?: string;

  createdAt: Date;
}

export const HopaeDeniedRequestSchema =
  SchemaFactory.createForClass(HopaeDeniedRequest);

HopaeDeniedRequestSchema.index({ ip: 1, createdAt: -1 });
HopaeDeniedRequestSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
