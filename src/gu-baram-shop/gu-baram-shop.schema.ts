import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 원본 RawDataShop이다. 상점에는 이름이 없다 — 어느 NPC가 어느 상점을 여는지는
// 서버 대본에만 있어서, 파는 물건의 구성으로 성격(label)을 대신 붙여 둔다.

@Schema({ _id: false })
export class GuBaramShopEntry {
  @Prop({ required: true })
  itemId: number;

  // 적재 시점의 아이템 이름. 목록을 매번 조인하지 않으려고 함께 담는다.
  @Prop()
  name?: string;

  @Prop()
  group?: string;

  // 기본 가격 대비 백분율. 100이면 그대로다(156곳 중 7곳만 다르다).
  @Prop({ default: 100 })
  multiplier: number;

  // 기본 가격 × 배수. 정렬·합계에 쓰려고 미리 계산해 둔다.
  @Prop({ default: 0 })
  price: number;
}

@Schema({
  collection: 'gu_baram_shops',
  versionKey: false,
})
export class GuBaramShop extends Document {
  @Prop({ required: true, unique: true, index: true })
  shopId: number;

  @Prop({ required: true, index: true })
  label: string;

  @Prop({ required: true, index: true })
  itemCount: number;

  // 아이템 표에 없는 번호를 파는 경우. 지금 원본에서는 0이다.
  @Prop({ default: 0 })
  missingCount: number;

  @Prop({ default: 0 })
  totalPrice: number;

  @Prop({ type: [GuBaramShopEntry], default: [] })
  items: GuBaramShopEntry[];
}

export const GuBaramShopSchema = SchemaFactory.createForClass(GuBaramShop);

GuBaramShopSchema.index({ 'items.itemId': 1 });
GuBaramShopSchema.index({ itemCount: -1, shopId: 1 });
