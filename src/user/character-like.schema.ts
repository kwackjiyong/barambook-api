import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'character_likes' })
export class CharacterLike extends Document {
  @Prop({ required: true, index: true })
  Name: string;

  @Prop({ required: true, index: true })
  ipHash: string;

  @Prop({ required: true, index: true })
  likedDateKey: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CharacterLikeSchema = SchemaFactory.createForClass(CharacterLike);

CharacterLikeSchema.index(
  { Name: 1, ipHash: 1, likedDateKey: 1 },
  { unique: true },
);
CharacterLikeSchema.index({ Name: 1, createdAt: -1 });
