import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'character_searches' })
export class CharacterSearch extends Document {
  @Prop({ required: true, index: true })
  Name: string;

  @Prop({ required: true })
  ipHash: string;

  @Prop({ required: true })
  searchDateKey: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const CharacterSearchSchema =
  SchemaFactory.createForClass(CharacterSearch);

CharacterSearchSchema.index({ Name: 1, createdAt: -1 });
CharacterSearchSchema.index(
  { ipHash: 1, Name: 1, searchDateKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      ipHash: { $exists: true },
      searchDateKey: { $exists: true },
    },
  },
);
