import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

interface DropInterface {
  id: number;
  cnt: number;
  name: string;
  unit: string;
}

@Schema()
export class Monster extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  id: number;

  @Prop()
  name: string;

  @Prop()
  ac: number;

  @Prop()
  caption: string;

  @Prop()
  drop: Array<DropInterface>;

  @Prop()
  cnt: string;
}

export const MonsterSchema = SchemaFactory.createForClass(Monster);
