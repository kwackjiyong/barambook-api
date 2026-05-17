import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface WorldMapPortalPoint {
  x: number;
  y: number;
}

export interface WorldMapEntry {
  name: string;
  portal: WorldMapPortalPoint;
}

@Schema({ strict: false })
export class WorldMap extends Document {
  @Prop()
  _id: string;

  @Prop({ type: Array })
  l?: WorldMapEntry[];

  @Prop({ type: Array })
  maps?: WorldMapEntry[];

  @Prop({ type: Array })
  groups?: WorldMapEntry[][];

  @Prop()
  name?: string;

  @Prop({ type: Object })
  portal?: WorldMapPortalPoint;
}

export const WorldMapSchema = SchemaFactory.createForClass(WorldMap);
