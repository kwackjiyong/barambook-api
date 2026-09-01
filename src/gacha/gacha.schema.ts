import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 클래식 월드 Gacha 표의 GroupId 한 그룹 = 뽑기 상자 하나.
// Rate는 원본 가중치 그대로 두고, 나눗셈을 매번 하지 않도록 chance(%)를 미리 계산해 담는다.

@Schema({ _id: false })
export class GachaGroupItem {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  count: number;

  @Prop({ required: true })
  rate: number;

  // rate ÷ 그룹 Rate 합 × 100. 소수 6자리 반올림.
  @Prop({ required: true })
  chance: number;
}

@Schema({ _id: false })
export class GachaBonusItem {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  count: number;
}

@Schema({
  collection: 'gacha_groups',
  versionKey: false,
})
export class GachaGroup extends Document {
  @Prop({ required: true, unique: true, index: true })
  groupId: number;

  // 화면 표시 이름. 원본 메모를 정리한 것이고, 픽업 상자는 픽업 대상 이름으로 짓는다.
  @Prop({ required: true })
  name: string;

  // 원본 Memo 전부. 같은 그룹에 다른 메모가 섞인 행이 있어 배열로 둔다.
  @Prop({ type: [String], default: [] })
  memos: string[];

  //   cash    상시 판매 캐시 상자 (넥슨 확률 공시 링크가 붙는다)
  //   monthly 월간 환기 뽑기
  //   pickup  픽업 뽑기 (101xxx 본 구성 + 102xxx 픽업 2종을 한 문서로 접음)
  //   ranking 랭킹 보상 상자
  //   event   그 외 이벤트 상자
  @Prop({ required: true, index: true })
  category: 'cash' | 'monthly' | 'pickup' | 'ranking' | 'event';

  @Prop({ type: [GachaGroupItem], default: [] })
  items: GachaGroupItem[];

  @Prop({ required: true })
  totalRate: number;

  @Prop({ required: true })
  itemCount: number;

  // "<메모>_보너스" 그룹을 접은 것. 확정 지급이라 확률 없이 이름·수량만 담는다.
  @Prop({ type: [GachaBonusItem], default: [] })
  bonusItems: GachaBonusItem[];

  // 픽업 상자의 102xxx 풀. 지금까지 전부 2종 50:50이다.
  @Prop({ type: [GachaGroupItem], default: [] })
  pickupItems: GachaGroupItem[];

  @Prop()
  pickupGroupId?: number;

  // CashItem.GachaLink — 넥슨 확률 공시 페이지.
  @Prop()
  gachaLink?: string;
}

export const GachaGroupSchema = SchemaFactory.createForClass(GachaGroup);

GachaGroupSchema.index({ 'items.name': 1 });
GachaGroupSchema.index({ 'pickupItems.name': 1 });
GachaGroupSchema.index({ category: 1, groupId: 1 });
