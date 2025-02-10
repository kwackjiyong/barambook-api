import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

interface MapObjectInterface {
  name: string;
  x: number;
  y: number;
}

@Schema()
export class Map extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  code: number;

  @Prop()
  height: number;

  @Prop()
  name: string;

  @Prop()
  npc: Array<MapObjectInterface>;

  @Prop()
  portal: Array<MapObjectInterface>;

  @Prop()
  width: number;
}

export const MapSchema = SchemaFactory.createForClass(Map);
