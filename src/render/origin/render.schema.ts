import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

interface RenderDetailInterface {
  code: number;
  color: number;
  name: string;
}

@Schema()
export class Render extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  head: Array<RenderDetailInterface>;

  @Prop()
  body: Array<RenderDetailInterface>;

  @Prop()
  weapon: Array<RenderDetailInterface>;

  @Prop()
  shield: Array<RenderDetailInterface>;
}

export const RenderSchema = SchemaFactory.createForClass(Render);
