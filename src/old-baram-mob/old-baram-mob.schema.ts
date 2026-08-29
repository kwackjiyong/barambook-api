import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 원본 MobData 한 행 + MobSpell·FixedPosMobSpawn·DimensionMobSpawn을 붙여 둔다.
// 출현 정보는 합쳐도 1,152행뿐이라 몬스터 문서 안에 그대로 담는 편이 읽기 쉽다.

@Schema({ _id: false })
export class OldBaramMobSpawn {
  @Prop({ required: true })
  kind: 'fixed' | 'dimension';

  @Prop({ required: true })
  mapId: number;

  @Prop()
  mapName?: string;

  @Prop()
  x?: number;

  @Prop()
  y?: number;

  @Prop()
  x0?: number;

  @Prop()
  x1?: number;

  @Prop()
  y0?: number;

  @Prop()
  y1?: number;

  @Prop()
  count?: number;

  @Prop()
  respawn?: number;

  @Prop()
  delay?: number;

  @Prop()
  boss?: boolean;
}

@Schema({ _id: false })
export class OldBaramMobSpellRef {
  @Prop({ required: true })
  spellId: number;

  @Prop()
  name?: string;
}

@Schema({
  collection: 'old_baram_mobs',
  versionKey: false,
})
export class OldBaramMob extends Document {
  @Prop({ required: true, unique: true, index: true })
  mobId: number;

  @Prop({ required: true, index: true })
  name: string;

  // 외형. MobResources_IndexMap(id, dye)와 짝을 이룬다.
  @Prop({ required: true })
  imageId: number;

  @Prop({ required: true })
  dye: number;

  @Prop({ required: true, index: true })
  maxHp: number;

  @Prop({ required: true, index: true })
  exp: number;

  // 낮을수록 단단하다. 원본은 -99 ~ 100.
  @Prop({ required: true })
  armorClass: number;

  @Prop()
  magicDefense?: number;

  @Prop({ required: true, index: true })
  size: string;

  @Prop()
  attackType?: number;

  @Prop()
  damageMin?: number;

  @Prop()
  damageMax?: number;

  @Prop()
  attackInterval?: number;

  @Prop({ required: true })
  paralyzable: boolean;

  @Prop({ required: true })
  despairable: boolean;

  @Prop({ type: [OldBaramMobSpellRef], default: [] })
  spells: OldBaramMobSpellRef[];

  @Prop({ type: [OldBaramMobSpawn], default: [] })
  spawns: OldBaramMobSpawn[];

  @Prop({ required: true, index: true })
  hasImage: boolean;

  // CDN의 스프라이트 시트 폴더 이름. 보통 "{imageId}-{dye}"다.
  @Prop()
  imageKey?: string;

  // 원본에 그 염색이 없어 다른 염색 시트를 빌려 쓴 경우 false.
  @Prop({ default: true })
  imageExact: boolean;

  // 대표 정지 프레임의 크기. 목록 카드에서 이미지 자리를 잡는 데 쓴다.
  @Prop()
  imageWidth?: number;

  @Prop()
  imageHeight?: number;

  @Prop()
  frameCount?: number;
}

export const OldBaramMobSchema = SchemaFactory.createForClass(OldBaramMob);

OldBaramMobSchema.index({ name: 1, mobId: 1 });
OldBaramMobSchema.index({ exp: -1, mobId: 1 });
OldBaramMobSchema.index({ maxHp: -1, mobId: 1 });
