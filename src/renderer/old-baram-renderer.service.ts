import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  OldBaramRenderer,
  type OldBaramRenderRequest,
  type OldBaramSlotKey,
} from '../lib/old-baram/renderer';

/** 염색 목록 썸네일 확대율. 칸 크기와 응답 무게를 함께 잡아 준다. */
const DYE_THUMBNAIL_ZOOM = 2;

@Injectable()
export class OldBaramRendererService implements OnModuleInit {
  private readonly renderer = new OldBaramRenderer();

  onModuleInit(): void {
    this.renderer.load();
  }

  render(params: OldBaramRenderRequest): Buffer {
    return this.renderer.render(params);
  }

  getOptions() {
    return this.renderer.getOptions();
  }

  /** 한 부위의 염색 목록을 base64 PNG 배열 한 벌로 내려보낸다. */
  getDyeList(slot: OldBaramSlotKey, params: OldBaramRenderRequest) {
    const sheet = this.renderer.renderDyeSheet(slot, {
      ...params,
      zoom: DYE_THUMBNAIL_ZOOM,
    });

    return {
      slot,
      item: sheet.item,
      zoom: DYE_THUMBNAIL_ZOOM,
      width: sheet.canvas.width * DYE_THUMBNAIL_ZOOM,
      height: sheet.canvas.height * DYE_THUMBNAIL_ZOOM,
      dyes: sheet.dyes.map((dye, index) => ({
        dye,
        image: sheet.images[index].toString('base64'),
      })),
    };
  }
}

