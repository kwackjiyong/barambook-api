import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// SpellInfo 한 행. 직업 컬럼은 "레벨,재료,수량,재료,수량…" 문자열이라 파싱해서 담는다.

@Schema({ _id: false })
export class OldBaramSpellMaterial {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  count: number;
}

@Schema({ _id: false })
export class OldBaramSpellLearn {
  @Prop({ required: true })
  job: number;

  @Prop({ required: true })
  jobName: string;

  @Prop({ required: true })
  level: number;

  @Prop({ type: [OldBaramSpellMaterial], default: [] })
  materials: OldBaramSpellMaterial[];
}

@Schema({ _id: false })
export class OldBaramSpellMobRef {
  @Prop({ required: true })
  mobId: number;

  @Prop()
  name?: string;
}

@Schema({
  collection: 'old_baram_spells',
  versionKey: false,
})
export class OldBaramSpell extends Document {
  @Prop({ required: true, unique: true, index: true })
  spellId: number;

  @Prop({ required: true, index: true })
  name: string;

  // 원본 분류 코드. 의미가 확정되지 않아 화면에는 쓰지 않는다.
  @Prop()
  type?: number;

  // 시전 방식. InputReceiverComp.RequestCastSpell이 갈라지는 세 갈래다.
  //   target  대상을 골라야 한다 (type 2·3·9)
  //   prompt  안내 문구를 띄우고 값을 입력받는다 (msg가 있는 경우)
  //   instant 대상 없이 바로 나간다
  @Prop({ required: true })
  castMode: 'target' | 'prompt' | 'instant';

  @Prop()
  delayGroup?: number;

  @Prop({ type: [OldBaramSpellLearn], default: [] })
  learn: OldBaramSpellLearn[];

  // learn이 있는 직업 번호. 필터용.
  @Prop({ type: [Number], default: [], index: true })
  jobs: number[];

  @Prop()
  minLevel?: number;

  @Prop()
  promptMessage?: string;

  @Prop()
  sayMessage?: string;

  @Prop()
  castMessage?: string;

  @Prop()
  affectedMessage?: string;

  @Prop()
  removedMessage?: string;

  @Prop({ required: true })
  negative: boolean;

  @Prop({ required: true })
  curse: boolean;

  // 이름이 밑줄로 시작하는 내부 처리용 마법. 기본 목록에서 제외한다.
  @Prop({ required: true, index: true })
  internal: boolean;

  @Prop({ type: [OldBaramSpellMobRef], default: [] })
  mobs: OldBaramSpellMobRef[];

  // 직업 습득 조건이 없고 몬스터만 쓰는 마법.
  @Prop({ required: true, index: true })
  mobOnly: boolean;
}

export const OldBaramSpellSchema = SchemaFactory.createForClass(OldBaramSpell);

OldBaramSpellSchema.index({ internal: 1, name: 1 });
OldBaramSpellSchema.index({ internal: 1, minLevel: 1, spellId: 1 });
