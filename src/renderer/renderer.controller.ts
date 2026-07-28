import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RendererService } from './renderer.service';

/** 쿼리에 값이 없으면 기본/없음 인덱스로 둔다. */
function toIndex(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

@Controller('renderer')
export class RendererController {
  constructor(private readonly svc: RendererService) {}
  @Get()
  async render(
    @Query('head') head: number,
    @Query('headc') headc: number,
    @Query('body') body: number,
    @Query('bodyc') bodyc: number,
    @Query('weapon') weapon: number,
    @Query('weaponc') weaponc: number,
    @Query('weaponrc') weaponrc: number,
    @Query('shield') shield: number,
    @Query('shieldc') shieldc: number,
    @Query('skinc') skinc: number,
    @Query('headMode') headMode: 'head' | 'face-hair',
    @Query('face') face: number,
    @Query('hair') hair: number,
    @Query('hairc') hairc: number,
    @Query('riding') riding: number,
    @Query('bodyDye') bodyDye: number,
    @Query('weaponDye') weaponDye: number,
    @Query('frame') frame: number,
    @Query('isAction') isAction: 'Y' | 'N',
    @Res() res: Response,
  ) {
    const params = {
      head: Number(head),
      headc: Number(headc),
      body: Number(body),
      bodyc: Number(bodyc),
      weapon: Number(weapon),
      weaponc: Number(weaponc),
      weaponrc: Number(weaponrc),
      shield: Number(shield),
      shieldc: Number(shieldc),
      skinc: toIndex(skinc, 0),
      // 메월(char-ms) 데이터로 추가된 외형. 없으면 기존 외형 그대로다.
      headMode: headMode === 'face-hair' ? 'face-hair' : 'head',
      face: toIndex(face, -1),
      hair: toIndex(hair, -1),
      hairc: toIndex(hairc, 0),
      riding: toIndex(riding, 0),
      bodyDye: toIndex(bodyDye, 0),
      weaponDye: toIndex(weaponDye, 0),
      frame: Number(frame),
      isAction: isAction === 'Y',
      // width: q.width ? Number(q.width) : undefined,
      // height: q.height ? Number(q.height) : undefined,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const buf = await this.svc.render(params as any);

    res.send({ imageBuffer: buf.toString('base64') });
  }
  @Get('/array')
  async arrayRender(
    @Query('head') head: number,
    @Query('headc') headc: number,
    @Query('body') body: number,
    @Query('bodyc') bodyc: number,
    @Query('weapon') weapon: number,
    @Query('weaponc') weaponc: number,
    @Query('weaponrc') weaponrc: number,
    @Query('shield') shield: number,
    @Query('shieldc') shieldc: number,
    @Query('skinc') skinc: number,
    @Query('headMode') headMode: 'head' | 'face-hair',
    @Query('face') face: number,
    @Query('hair') hair: number,
    @Query('hairc') hairc: number,
    @Query('riding') riding: number,
    @Query('bodyDye') bodyDye: number,
    @Query('weaponDye') weaponDye: number,
    @Query('frame') frame: number,
    @Query('isAction') isAction: 'Y' | 'N',
    @Res() res: Response,
  ) {
    const params = {
      head: Number(head),
      headc: Number(headc),
      body: Number(body),
      bodyc: Number(bodyc),
      weapon: Number(weapon),
      weaponc: Number(weaponc),
      weaponrc: Number(weaponrc),
      shield: Number(shield),
      shieldc: Number(shieldc),
      skinc: toIndex(skinc, 0),
      // 메월(char-ms) 데이터로 추가된 외형. 없으면 기존 외형 그대로다.
      headMode: headMode === 'face-hair' ? 'face-hair' : 'head',
      face: toIndex(face, -1),
      hair: toIndex(hair, -1),
      hairc: toIndex(hairc, 0),
      riding: toIndex(riding, 0),
      bodyDye: toIndex(bodyDye, 0),
      weaponDye: toIndex(weaponDye, 0),
      frame: Number(frame),
      isAction: isAction === 'Y',
      // width: q.width ? Number(q.width) : undefined,
      // height: q.height ? Number(q.height) : undefined,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const buffers = await this.svc.pngRender(params as any);

    res.send({ imageBuffers: buffers.map((b) => b.toString('base64')) });
  }
}
