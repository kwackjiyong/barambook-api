import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
interface EquipItemInterface {
  id: number;
  name: string;
  type: string;
  job: string;
  level: number;
  price: number;
  selPrice?: number;
  max?: number;
  min?: number;
  ac?: number;
  dam?: number;
  str?: number;
  dex?: number;
  durable: number;
  gender?: string;
  hit?: number;
  hp?: number;
  mp?: number;
  int?: number;
  minStr?: number;
  reflect?: number;
  regen?: number;
  isNotRepair?: boolean;
  specialEffect?: string;
}

interface EtcItemInterface {
  id: number;
  name: string;
  type: string;
  price: number;
  selPrice?: number;
  consumeCnt?: number;
  hpEffect?: number;
  mpEffect?: number;
  specialEffect?: string;
}

@Schema()
export class Item extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  equip: Array<EquipItemInterface>;

  @Prop()
  etc: Array<EtcItemInterface>;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
