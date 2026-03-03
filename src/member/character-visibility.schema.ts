import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'character_visibilities' })
export class CharacterVisibility extends Document {
  @Prop({ required: true, index: true })
  MSWID: string;

  @Prop({ required: true, index: true })
  Name: string;

  @Prop({ required: true, default: true })
  isHidden: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CharacterVisibilitySchema =
  SchemaFactory.createForClass(CharacterVisibility);

CharacterVisibilitySchema.index({ MSWID: 1, Name: 1 }, { unique: true });
