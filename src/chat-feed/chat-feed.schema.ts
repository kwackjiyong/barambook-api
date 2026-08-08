import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const CHAT_TYPES = ['사자후', '방송쿠폰'] as const;
export type ChatType = (typeof CHAT_TYPES)[number];

// 채팅은 분당 25건 안팎으로 적재되므로 보관 기간을 두지 않으면 컬렉션이 무한히 커진다.
// 90일이면 약 320만 건(디스크 약 640MB)에서 크기가 고정된다.
export const CHAT_RETENTION_DAYS = 90;

// 적재된 채팅은 수정되지 않으므로 updatedAt과 __v는 문서 크기만 차지한다.
@Schema({
  collection: 'chat_messages',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class ChatMessage extends Document {
  @Prop({ type: String, required: true, enum: CHAT_TYPES })
  type: ChatType;

  @Prop({ required: true, trim: true, maxlength: 30 })
  name: string;

  @Prop({ required: true, trim: true, maxlength: 32 })
  worldTagId: string;

  @Prop({ required: true, maxlength: 500 })
  content: string;

  @Prop({ required: true, maxlength: 160, unique: true })
  sourceMessageId: string;

  createdAt: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// 기본 피드 정렬과 커서 페이징에 사용한다.
ChatMessageSchema.index({ createdAt: -1, _id: -1 });
// 유형 탭 + 최신순. type 단독 인덱스는 이 인덱스의 prefix라 따로 두지 않는다.
ChatMessageSchema.index({ type: 1, createdAt: -1, _id: -1 });
// 보관 기간이 지난 채팅을 자동으로 지운다. TTL은 단일 필드 인덱스여야 해서
// 위 복합 인덱스를 재사용할 수 없고, 삭제는 TTL 모니터 주기(60초)만큼 늦게 일어난다.
// 기간을 바꿀 때는 DB에서 인덱스를 직접 재생성해야 한다.
// 스키마 숫자만 고치면 기동 시 IndexOptionsConflict로 앱이 뜨지 않는다.
ChatMessageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: CHAT_RETENTION_DAYS * 24 * 60 * 60 },
);
