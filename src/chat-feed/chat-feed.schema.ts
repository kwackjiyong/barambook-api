import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const CHAT_TYPES = ['사자후', '방송쿠폰'] as const;
export type ChatType = (typeof CHAT_TYPES)[number];

@Schema({ collection: 'chat_messages', timestamps: true })
export class ChatMessage extends Document {
  @Prop({ type: String, required: true, enum: CHAT_TYPES, index: true })
  type: ChatType;

  @Prop({ required: true, trim: true, maxlength: 30, index: true })
  name: string;

  @Prop({ required: true, trim: true, maxlength: 32, index: true })
  worldTagId: string;

  @Prop({ required: true, maxlength: 500 })
  content: string;

  @Prop({ required: true, maxlength: 160, unique: true })
  sourceMessageId: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

ChatMessageSchema.index({ createdAt: -1, _id: -1 });
ChatMessageSchema.index({ type: 1, createdAt: -1, _id: -1 });
