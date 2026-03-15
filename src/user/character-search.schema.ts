import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'character_searches' })
export class CharacterSearch extends Document {
  @Prop({ required: true, index: true })
  Name: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CharacterSearchSchema =
  SchemaFactory.createForClass(CharacterSearch);

CharacterSearchSchema.index({ Name: 1, createdAt: -1 });
