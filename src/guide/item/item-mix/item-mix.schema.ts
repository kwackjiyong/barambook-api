import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
interface ItemMaterialInterface {
  num: number;
  name: string;
  code: number;
  isRemain?: boolean;
}

@Schema()
export class ItemMix extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  name: string;

  @Prop()
  code: number;

  @Prop()
  probability: number;

  @Prop()
  material: Array<ItemMaterialInterface>;
}

export const ItemMixSchema = SchemaFactory.createForClass(ItemMix);
