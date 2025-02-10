import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class RenderFrame extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  code: number;

  @Prop()
  direction: string;

  @Prop()
  type: string;
}

export const RenderFrameSchema = SchemaFactory.createForClass(RenderFrame);
