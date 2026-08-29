import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  collection: 'old_baram_items',
  versionKey: false,
})
export class OldBaramItem extends Document {
  @Prop({ required: true, unique: true, index: true })
  itemId: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true, min: 0, max: 11, index: true })
  type: number;

  @Prop()
  iconId?: number;

  @Prop()
  avatarId?: number;

  @Prop()
  dye?: number;

  @Prop()
  maxQuantity?: number;

  @Prop()
  maxDurability?: number;

  @Prop()
  price?: number;

  @Prop()
  requiredMight?: number;

  @Prop({ index: true })
  requiredGender?: number;

  @Prop({ index: true })
  requiredLevel?: number;

  @Prop({ index: true })
  requiredJob?: number;

  @Prop()
  requiredGrade?: number;

  @Prop()
  onDead?: number;

  @Prop({ required: true })
  tradeable: boolean;

  @Prop({ required: true })
  storable: boolean;

  @Prop({ required: true })
  repairable: boolean;

  @Prop()
  repairPrice?: number;

  @Prop()
  storagePrice?: number;

  @Prop()
  namingPrice?: number;

  @Prop()
  onUse?: string;

  @Prop()
  description?: string;

  @Prop()
  unitName?: string;

  @Prop()
  smallDamageMin?: number;

  @Prop()
  smallDamageMax?: number;

  @Prop()
  largeDamageMin?: number;

  @Prop()
  largeDamageMax?: number;

  @Prop()
  armorClass?: number;

  @Prop()
  maxHp?: number;

  @Prop()
  maxMp?: number;

  @Prop()
  hit?: number;

  @Prop()
  damage?: number;

  @Prop()
  might?: number;

  @Prop()
  will?: number;

  @Prop()
  grace?: number;

  @Prop()
  regeneration?: number;

  @Prop()
  magicDefense?: number;

  @Prop()
  swingSound?: number;

  @Prop({ required: true })
  twoHanded: boolean;

  @Prop()
  maxHpPercent?: number;

  @Prop()
  maxMpPercent?: number;

  @Prop()
  pdu?: number;

  @Prop({ required: true })
  hasIcon: boolean;
}

export const OldBaramItemSchema = SchemaFactory.createForClass(OldBaramItem);

OldBaramItemSchema.index({
  type: 1,
  requiredJob: 1,
  requiredGender: 1,
  itemId: 1,
});
