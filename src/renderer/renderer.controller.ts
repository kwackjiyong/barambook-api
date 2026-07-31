import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { RendererService } from './renderer.service';
import { OldBaramRendererService } from './old-baram-renderer.service';
import { rateLimit } from '../common/rate-limit.guard';
import {
  SLOT_KEYS,
  type OldBaramRenderRequest,
  type OldBaramSlotKey,
} from '../lib/old-baram/renderer';
import type { OldBaramState } from '../lib/old-baram/actions';

/*
 * 옛날바람 렌더 속도 제한.
 *
 * 합성 한 장이 서버 CPU 10ms를 쓰고 프로세스가 하나뿐이라, 막지 않으면 전량 수집이
 * 두어 시간 만에 끝나면서 그동안 서버가 통째로 눌린다.
 * 정상 사용의 최대치는 동작 재생(200ms 간격 = 초당 5장)이라 그 두 배를 상시 속도로 두고,
 * 착용을 바꿀 때 프레임을 미리 받아 두는 몫은 burst 로 흡수한다.
 */
const RENDER_RATE_PER_SECOND = 10;
const RENDER_BURST = 30;
/*
 * 염색 목록은 한 번에 32장을 그려 CPU를 350ms 쓴다(렌더의 32배).
 * 팝업을 잇달아 열어 보는 정도는 burst 로 덮고, 상시 속도는 2초에 한 번으로 묶는다.
 */
const DYE_LIST_RATE_PER_SECOND = 0.5;
const DYE_LIST_BURST = 6;

/** 쿼리에 값이 없으면 기본/없음 인덱스로 둔다. */
function toIndex(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

@Controller('renderer')
export class RendererController {
  constructor(
    private readonly svc: RendererService,
    private readonly oldBaram: OldBaramRendererService,
  ) {}

  @Get('/old-baram')
  @UseGuards(rateLimit(RENDER_RATE_PER_SECOND, RENDER_BURST))
  renderOldBaram(
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ) {
    try {
      const png = this.oldBaram.render(parseOldBaramQuery(query));
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', String(png.byteLength));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(png);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get('/old-baram/options')
  getOldBaramOptions() {
    return this.oldBaram.getOptions();
  }

  /**
   * 한 부위의 염색 목록을 썸네일까지 한 번에 내려보낸다.
   * 착용값은 렌더 API와 같은 쿼리를 쓰고, `slot` 이 가리키는 부위의 염색만 바뀐다.
   */
  @Get('/old-baram/dyes')
  @UseGuards(rateLimit(DYE_LIST_RATE_PER_SECOND, DYE_LIST_BURST))
  @Header('Cache-Control', 'public, max-age=86400')
  getOldBaramDyes(@Query() query: Record<string, string | undefined>) {
    const slot = query.slot;
    if (!isSlotKey(slot)) {
      throw new BadRequestException(
        `slot은 ${SLOT_KEYS.join(', ')} 중 하나여야 합니다.`,
      );
    }

    try {
      return this.oldBaram.getDyeList(slot, parseOldBaramQuery(query));
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

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

function isSlotKey(value: unknown): value is OldBaramSlotKey {
  return SLOT_KEYS.includes(value as OldBaramSlotKey);
}

function optionalInteger(
  query: Record<string, string | undefined>,
  key: string,
): number | undefined {
  const value = query[key];
  if (value === undefined || value === '') return undefined;
  if (!/^-?\d+$/.test(value)) {
    throw new BadRequestException(`${key}은 정수여야 합니다.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`${key}이 안전한 정수 범위를 벗어났습니다.`);
  }
  return parsed;
}

function optionalBoolean(
  query: Record<string, string | undefined>,
  key: string,
): boolean | undefined {
  const value = query[key];
  if (value === undefined || value === '') return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new BadRequestException(`${key}은 true/false 또는 1/0이어야 합니다.`);
}

function parseOldBaramQuery(
  query: Record<string, string | undefined>,
): OldBaramRenderRequest {
  return {
    head: optionalInteger(query, 'head'),
    headDye: optionalInteger(query, 'headDye'),
    body: optionalInteger(query, 'body'),
    bodyDye: optionalInteger(query, 'bodyDye'),
    weapon: optionalInteger(query, 'weapon'),
    weaponDye: optionalInteger(query, 'weaponDye'),
    shield: optionalInteger(query, 'shield'),
    shieldDye: optionalInteger(query, 'shieldDye'),
    state: query.state as OldBaramState | undefined,
    direction: optionalInteger(query, 'direction'),
    frame: optionalInteger(query, 'frame'),
    emote: optionalInteger(query, 'emote'),
    colorFrame: optionalInteger(query, 'colorFrame'),
    shadow: optionalBoolean(query, 'shadow'),
    zoom: optionalInteger(query, 'zoom'),
  };
}
