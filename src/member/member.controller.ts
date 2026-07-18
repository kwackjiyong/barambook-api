import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RendererService } from '../renderer/renderer.service';
import { GRADES } from './grade';
import { Member } from './member.schema';
import { MemberSessionGuard } from './member-session.guard';
import { MemberService } from './member.service';

type AuthenticatedRequest = Request & {
  member?: Member;
};

// 같은 updatedAt이면 재렌더 없이 재사용하는 대표 캐릭터 이미지 메모리 캐시
interface CachedCharacterImage {
  version: number;
  buffer: Buffer;
}

const CHARACTER_CACHE_LIMIT = 200;

@Controller('member')
export class MemberController {
  private readonly characterImageCache = new Map<
    string,
    CachedCharacterImage
  >();

  constructor(
    private readonly memberService: MemberService,
    private readonly rendererService: RendererService,
  ) {}

  @Get('grades')
  getGrades() {
    return GRADES;
  }

  @Post('attendance')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  checkAttendance(@Req() req: AuthenticatedRequest) {
    return this.memberService.checkAttendance(req.member as Member);
  }

  /**
   * 저장된 대표 캐릭터를 이미지 바이너리(PNG/APNG)로 응답한다.
   * 기존 GET /renderer는 base64 JSON이라 <img src>로 쓸 수 없어 신설했다.
   */
  @Get(':accountId/character')
  async getCharacterImage(
    @Param('accountId') accountId: string,
    @Res() res: Response,
  ) {
    const renderCharacter =
      await this.memberService.findRenderCharacter(accountId);

    if (!renderCharacter) {
      throw new NotFoundException('대표 캐릭터가 설정되지 않았습니다.');
    }

    const version = new Date(renderCharacter.updatedAt).getTime();
    let cached = this.characterImageCache.get(accountId);

    if (!cached || cached.version !== version) {
      const request = renderCharacter.request;
      const buffer = await this.rendererService.render({
        head: request.head,
        headc: request.headc,
        body: request.body,
        bodyc: request.bodyc,
        weapon: request.weapon,
        weaponc: request.weaponc,
        weaponrc: request.weaponrc ?? 0,
        shield: request.shield,
        shieldc: request.shieldc,
        frame: request.frame,
        isAction: request.isAction === 'Y',
      });

      cached = { version, buffer };

      // 캐시 상한 도달 시 가장 오래된 항목부터 정리 (Map은 삽입 순서 보존)
      if (this.characterImageCache.size >= CHARACTER_CACHE_LIMIT) {
        const oldestKey = this.characterImageCache.keys().next().value;

        if (oldestKey != null) {
          this.characterImageCache.delete(oldestKey);
        }
      }

      this.characterImageCache.delete(accountId);
      this.characterImageCache.set(accountId, cached);
    }

    // APNG도 image/png으로 응답하면 지원 브라우저에서 애니메이션된다.
    res.setHeader('Content-Type', 'image/png');
    // 대표 캐릭터 변경이 늦지 않게 반영되도록 짧게 캐시한다.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(cached.buffer);
  }
}
