import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

interface MonsterMapInterface {
  level: number;
  mapName: string;
  monsters: Array<string>;
}

@Schema()
export class MonsterMap extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  locate: string;

  @Prop()
  maps: Array<MonsterMapInterface>;
}

export const MonsterMapSchema = SchemaFactory.createForClass(MonsterMap);
