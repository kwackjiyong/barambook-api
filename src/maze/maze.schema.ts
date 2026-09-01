import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// 부여 대미궁 변형 맵 하나. index(1~53) × base(500~508) = 477행.
// 이미지는 CDN maze/v1/image/{mapId}.webp 이고 여기엔 메타만 둔다.

// 포탈 위치는 53개 변형 전부에서 같다(벽 데이터로 2,756칸 전수 검증).
// 그래서 변형이 아니라 base에 딸린 값이지만, 조회를 한 번에 끝내려고
// 각 변형 문서에 같이 넣어 둔다.
@Schema({ _id: false })
export class MazePortal {
  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;

  @Prop({ required: true })
  label: string;

  // 미궁 안 다른 층으로 가는 포탈이면 그 base(501~508). 화면에서 해당 카드로 스크롤.
  @Prop()
  jumpBase?: number;

  // 미궁 밖 지도로 가는 포탈이면 그 맵 코드(/map?code=). 부여성·상점방.
  @Prop()
  mapCode?: number;
}

@Schema({
  collection: 'maze_maps',
  versionKey: false,
})
export class MazeMap extends Document {
  @Prop({ required: true, unique: true, index: true })
  mapId: number;

  // 주간 로테이션이 고르는 변형 번호 (1~53).
  @Prop({ required: true, index: true })
  index: number;

  // 500 입구, 501~508 대미궁 1~8.
  @Prop({ required: true })
  base: number;

  @Prop({ required: true })
  name: string;

  // CDN 파일명(무작위 32자리 hex). URL을 mapId로 추측하지 못하게 하는 열쇠라
  // 이번 주 응답에만 실어 보낸다.
  @Prop({ required: true, unique: true })
  imageKey: string;

  // 타일 단위 크기.
  @Prop({ required: true })
  width: number;

  @Prop({ required: true })
  height: number;

  // 렌더된 webp의 픽셀 크기.
  @Prop({ required: true })
  imageWidth: number;

  @Prop({ required: true })
  imageHeight: number;

  @Prop({ type: [MazePortal], default: [] })
  portals: MazePortal[];
}

export const MazeMapSchema = SchemaFactory.createForClass(MazeMap);

MazeMapSchema.index({ index: 1, base: 1 });
