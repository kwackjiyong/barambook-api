import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 원본 CRawDataWeaponItem 외 7개 표를 하나로 합친 것이다. 아이템 번호는 표를
// 넘어 하나의 번호 공간이라(무기 15 · 방패 14 · 투구 12) 겹치지 않는다.
//
// 능력치는 원본에 수치 칸이 없다. 게임이 그대로 찍어 주는 툴팁 글
// ("무장:  -3 Hit:  0 Dam:  0\n체력치 상승:  300\n")을 적재할 때 읽어 채운다.

@Schema({ _id: false })
export class GuBaramItemStats {
  // 무기 파괴력. 작은 대상 / 큰 대상으로 나뉜다.
  @Prop()
  smallMin?: number;

  @Prop()
  smallMax?: number;

  @Prop()
  largeMin?: number;

  @Prop()
  largeMax?: number;

  // 낮을수록 잘 막는다. 원본이 음수를 쓴다.
  @Prop()
  armor?: number;

  @Prop()
  hit?: number;

  @Prop()
  damage?: number;

  @Prop()
  hp?: number;

  @Prop()
  mp?: number;

  @Prop()
  str?: number;

  @Prop()
  dex?: number;

  @Prop()
  int?: number;

  @Prop()
  regen?: number;

  @Prop()
  magicDefense?: number;

  @Prop()
  damageReduction?: number;
}

@Schema({
  collection: 'gu_baram_items',
  versionKey: false,
})
export class GuBaramItem extends Document {
  @Prop({ required: true, unique: true, index: true })
  itemId: number;

  @Prop({ required: true, index: true })
  name: string;

  // 원본 표 이름에서 온 착용 부위. 화면 필터가 이걸 쓴다.
  @Prop({ required: true, index: true })
  group: string;

  // ItemType enum. 기타 표 안에 7~12가 섞여 있어 부위와 따로 논다.
  @Prop({ required: true, index: true })
  type: number;

  @Prop({ default: false })
  unique: boolean;

  @Prop({ default: 0 })
  maxCount: number;

  @Prop({ default: 0 })
  maxDurability: number;

  @Prop({ default: 0, index: true })
  price: number;

  @Prop({ default: 0, index: true })
  levelLimit: number;

  @Prop({ default: 0, index: true })
  jobLimit: number;

  @Prop({ default: 0 })
  jobLevelLimit: number;

  @Prop({ default: 0, index: true })
  genderLimit: number;

  @Prop({ default: 0 })
  strLimit: number;

  @Prop({ default: 0 })
  dexLimit: number;

  @Prop({ default: 0 })
  intLimit: number;

  @Prop({ default: true })
  canTrade: boolean;

  @Prop({ default: true })
  canRepair: boolean;

  @Prop({ default: '' })
  description: string;

  // 툴팁에서 수치로 못 읽은 줄. 자유 서술이라 설명글에 덧붙여 보여 준다.
  @Prop({ type: [String], default: [] })
  extraLines: string[];

  @Prop({ type: GuBaramItemStats, default: {} })
  stats: GuBaramItemStats;

  // 이 물건을 파는 상점 수. 상점에 이름이 없어 어디인지는 알려 줄 수 없다.
  @Prop({ default: 0, index: true })
  shopCount: number;

  @Prop({ required: true, index: true })
  hasIcon: boolean;
}

export const GuBaramItemSchema = SchemaFactory.createForClass(GuBaramItem);

GuBaramItemSchema.index({ name: 1, itemId: 1 });
GuBaramItemSchema.index({ levelLimit: -1, itemId: 1 });
GuBaramItemSchema.index({ price: -1, itemId: 1 });
