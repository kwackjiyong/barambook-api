import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RendererService } from './renderer.service';

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
