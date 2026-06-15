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

// 치장(코스튬) 아이템. 스탯/내구도가 없는 외형 아이템.
interface CostumeItemInterface {
  id: number;
  name: string;
  type: string;
  // 코스튬이 덮는 장비 슬롯(w:무기 a:갑옷). 염색약 종류(무기/의상)를 가른다.
  baseType?: string;
  price: number;
  source?: string;
  dropRate?: number;
}

@Schema()
export class Item extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  equip: Array<EquipItemInterface>;

  @Prop()
  etc: Array<EtcItemInterface>;

  @Prop()
  costume: Array<CostumeItemInterface>;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
