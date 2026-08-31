import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 원본 CRawDataMonster 한 행이 전부다. 이름·외형·염색·체력 네 칸뿐이고
// 공격력·경험치·드랍은 서버 전용이라 클라이언트 캐시에 들어오지 않는다.

@Schema({
  collection: 'gu_baram_mobs',
  versionKey: false,
})
export class GuBaramMob extends Document {
  @Prop({ required: true, unique: true, index: true })
  mobId: number;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true, index: true })
  maxHp: number;

  // 그림 자산 키. 화면에는 내보내지 않고 "비슷하게 생긴 몬스터"를 묶는 데만 쓴다.
  @Prop({ required: true, index: true })
  bodyId: number;

  @Prop({ required: true })
  dye: number;

  @Prop({ required: true, index: true })
  hasImage: boolean;
}

export const GuBaramMobSchema = SchemaFactory.createForClass(GuBaramMob);

GuBaramMobSchema.index({ name: 1, mobId: 1 });
GuBaramMobSchema.index({ maxHp: -1, mobId: 1 });
