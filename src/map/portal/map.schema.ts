import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

interface MapPortalInterface {
  c: number; // code
  p: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

@Schema()
export class MapPortal extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  c: number;

  @Prop()
  l: Array<MapPortalInterface>;
}

export const MapPortalSchema = SchemaFactory.createForClass(MapPortal);
