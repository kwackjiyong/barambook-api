import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// MapInfo 한 행 + Portal·FixedPosMobSpawn·DimensionMobSpawn·WorldMap을 붙여 둔다.

@Schema({ _id: false })
export class OldBaramMapPortal {
  // map 지도 이동 · world 세계이동 · script 특수 이동
  @Prop({ required: true })
  kind: 'map' | 'world' | 'script';

  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;

  // 미니맵에 찍을 때 쓰는 표기.
  @Prop()
  label?: string;

  @Prop()
  toMapId?: number;

  @Prop()
  toMapName?: string;

  @Prop()
  toX?: number;

  @Prop()
  toY?: number;

  // 원본 min/max. 레벨 제한으로 보이지만 확정되지 않아 값 그대로 담는다.
  @Prop()
  min?: number;

  @Prop()
  max?: number;
}

@Schema({ _id: false })
export class OldBaramMapMob {
  @Prop({ required: true })
  kind: 'fixed' | 'dimension';

  @Prop({ required: true })
  mobId: number;

  @Prop()
  name?: string;

  @Prop()
  x?: number;

  @Prop()
  y?: number;

  @Prop()
  count?: number;

  @Prop()
  respawn?: number;

  @Prop()
  delay?: number;

  @Prop()
  boss?: boolean;
}

@Schema({
  collection: 'old_baram_maps',
  versionKey: false,
})
export class OldBaramMap extends Document {
  @Prop({ required: true, unique: true, index: true })
  mapId: number;

  @Prop({ required: true, index: true })
  name: string;

  // 지도의 가로·세로 칸 수. 미니맵 위 포탈 위치를 계산하는 데 쓴다.
  @Prop()
  width?: number;

  @Prop()
  height?: number;

  @Prop({ index: true })
  parentMapId?: number;

  @Prop()
  parentName?: string;

  // 같은 던전·지역을 묶는 원본 키워드.
  @Prop({ index: true })
  keyword?: string;

  @Prop()
  bgm?: number;

  // 비트마스크. 의미가 확정되지 않아 화면에는 쓰지 않는다.
  @Prop()
  attr?: number;

  @Prop()
  returnMap?: string;

  @Prop()
  script?: string;

  @Prop({ required: true, index: true })
  disabled: boolean;

  @Prop({ type: [OldBaramMapPortal], default: [] })
  portals: OldBaramMapPortal[];

  @Prop({ default: 0 })
  portalCount: number;

  @Prop({ type: [OldBaramMapMob], default: [] })
  mobs: OldBaramMapMob[];

  @Prop({ default: 0, index: true })
  mobCount: number;

  @Prop({ required: true, index: true })
  hasMinimap: boolean;

  @Prop()
  minimapWidth?: number;

  @Prop()
  minimapHeight?: number;

  // WorldMap에 표시되는 지역이면 그 좌표.
  @Prop()
  worldMapName?: string;

  @Prop()
  worldMapX?: number;

  @Prop()
  worldMapY?: number;
}

export const OldBaramMapSchema = SchemaFactory.createForClass(OldBaramMap);

OldBaramMapSchema.index({ name: 1, mapId: 1 });
OldBaramMapSchema.index({ keyword: 1, mapId: 1 });
