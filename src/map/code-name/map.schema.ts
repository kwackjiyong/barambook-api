import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class MapCodeName extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  code: number;

  @Prop()
  name: string;
}

export const MapCodeNameSchema = SchemaFactory.createForClass(MapCodeName);
