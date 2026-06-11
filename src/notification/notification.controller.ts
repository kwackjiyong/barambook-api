import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Sse,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { MemberSessionGuard } from '../member/member-session.guard';
import { Member } from '../member/member.schema';
import {
  DeletePushSubscriptionDto,
  SavePushSubscriptionDto,
} from './dto/push-subscription.dto';
import { NotificationService } from './notification.service';

type AuthenticatedRequest = Request & {
  member?: Member;
};

@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // 웹푸시 구독에 필요한 VAPID 공개키. 미설정이면 null을 내려 푸시 UI를 숨긴다.
  @Get('/push-public-key')
  getPushPublicKey() {
    return { publicKey: this.notificationService.getPushPublicKey() };
  }

  @Post('/push-subscriptions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async savePushSubscription(
    @Req() req: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: SavePushSubscriptionDto,
  ) {
    const member = req.member as Member;
    await this.notificationService.savePushSubscription(
      member.accountId,
      dto.endpoint,
      dto.keys,
    );

    return { ok: true };
  }

  @Delete('/push-subscriptions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(MemberSessionGuard)
  async deletePushSubscription(
    @Req() req: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: DeletePushSubscriptionDto,
  ) {
    const member = req.member as Member;
    await this.notificationService.deletePushSubscription(
      member.accountId,
      dto.endpoint,
    );

    return { ok: true };
  }

  // 로그인 회원의 실시간 알림 스트림 (거래 요청 등)
  @Sse('/stream')
  @UseGuards(MemberSessionGuard)
  stream(@Req() req: AuthenticatedRequest): Observable<MessageEvent> {
    const member = req.member as Member;
    const { stream, close } = this.notificationService.openSseStream(
      member.accountId,
    );

    req.on('close', close);

    return stream.asObservable() as unknown as Observable<MessageEvent>;
  }
}
