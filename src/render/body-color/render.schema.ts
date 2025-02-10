import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class RenderBodyColor extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  code: number;

  @Prop()
  color: number;

  @Prop()
  name: string;
}

export const RenderBodyColorSchema =
  SchemaFactory.createForClass(RenderBodyColor);
