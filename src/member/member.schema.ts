import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Member extends Document {
  @Prop({ required: true, unique: true, index: true })
  accountId: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, unique: true, index: true })
  MSWID: string;

  @Prop({ required: true })
  verifiedAt: Date;

  @Prop()
  representativeCharacterName?: string;

  @Prop()
  sessionTokenHash?: string;

  @Prop()
  lastLoginAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const MemberSchema = SchemaFactory.createForClass(Member);
