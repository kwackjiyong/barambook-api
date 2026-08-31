import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 원본 CRawDataSkill + CRawDataBuffSkillEffect(버프 여부)다.
// 습득 직업·레벨·필요 재료와 실제 피해량은 서버 전용이라 여기 없다.

@Schema({
  collection: 'gu_baram_skills',
  versionKey: false,
})
export class GuBaramSkill extends Document {
  @Prop({ required: true, unique: true, index: true })
  skillId: number;

  @Prop({ required: true, index: true })
  name: string;

  // SkillInputType. DIE_* 계열은 죽은 채로도 쓸 수 있다(성황령 등).
  @Prop({ required: true, index: true })
  inputType: number;

  @Prop({ required: true, index: true })
  afterDeath: boolean;

  // 이 값이 같은 스킬끼리 재사용 대기를 나눠 쓴다. 0이면 묶이지 않는다.
  @Prop({ default: 0, index: true })
  sharedCooldownId: number;

  @Prop({ default: 0 })
  castIntervalTick: number;

  // 서버로 보내는 시전 대본. 보통 "@스킬이름"이다.
  @Prop({ default: '' })
  castScript: string;

  // 시전할 때 사용자에게 묻는 말. 없으면 빈 문자열이다.
  @Prop({ default: '' })
  message: string;

  @Prop({ default: false, index: true })
  buff: boolean;
}

export const GuBaramSkillSchema = SchemaFactory.createForClass(GuBaramSkill);

GuBaramSkillSchema.index({ name: 1, skillId: 1 });
