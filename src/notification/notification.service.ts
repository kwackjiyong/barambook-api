import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subject } from 'rxjs';
import * as webPush from 'web-push';
import { PushSubscription } from './push-subscription.schema';

// 거래 요청 알림 페이로드. SSE 이벤트와 웹푸시 본문에 공통으로 쓴다.
export interface TradeRequestNotification {
  type: 'trade-request';
  listingId: string;
  itemName: string;
  price: string;
  requesterNickname: string;
  url: string;
}

interface SseEvent {
  data: TradeRequestNotification;
}

// 구독이 사라진 엔드포인트로 판단하는 웹푸시 응답 코드
const GONE_STATUS_CODES = new Set([404, 410]);

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // 접속 중인 SSE 스트림 (accountId별 다중 탭 허용)
  private readonly sseStreams = new Map<string, Set<Subject<SseEvent>>>();

  private readonly vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  private readonly vapidConfigured: boolean;

  constructor(
    @InjectModel('push_subscriptions', 'barambook')
    private readonly pushSubscriptionModel: Model<PushSubscription>,
  ) {
    const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
    this.vapidConfigured = this.vapidPublicKey !== '' && privateKey !== '';

    if (this.vapidConfigured) {
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:admin@barambook.com',
        this.vapidPublicKey,
        privateKey,
      );
    } else {
      this.logger.warn(
        'VAPID 키가 설정되지 않아 웹푸시 발송이 비활성화됩니다. (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)',
      );
    }
  }

  getPushPublicKey(): string | null {
    return this.vapidConfigured ? this.vapidPublicKey : null;
  }

  // SSE 연결 등록. 연결이 끊기면 호출부에서 반환된 해제 함수를 실행한다.
  openSseStream(accountId: string): {
    stream: Subject<SseEvent>;
    close: () => void;
  } {
    const stream = new Subject<SseEvent>();
    const streams = this.sseStreams.get(accountId) ?? new Set();

    streams.add(stream);
    this.sseStreams.set(accountId, streams);

    return {
      stream,
      close: () => {
        stream.complete();
        streams.delete(stream);

        if (streams.size === 0) {
          this.sseStreams.delete(accountId);
        }
      },
    };
  }

  async savePushSubscription(
    accountId: string,
    endpoint: string,
    keys: { p256dh: string; auth: string },
  ): Promise<void> {
    await this.pushSubscriptionModel
      .updateOne(
        { endpoint },
        {
          $set: {
            accountId,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async deletePushSubscription(
    accountId: string,
    endpoint: string,
  ): Promise<void> {
    await this.pushSubscriptionModel.deleteOne({ accountId, endpoint }).exec();
  }

  /**
   * 거래 요청 알림 발송. 사이트를 보고 있는 탭에는 SSE로,
   * 등록된 기기에는 웹푸시로 보낸다. 실패해도 거래 흐름을 막지 않는다.
   */
  async notifyTradeRequest(
    ownerAccountId: string,
    notification: Omit<TradeRequestNotification, 'type'>,
  ): Promise<void> {
    const payload: TradeRequestNotification = {
      type: 'trade-request',
      ...notification,
    };

    const streams = this.sseStreams.get(ownerAccountId);

    if (streams) {
      for (const stream of streams) {
        stream.next({ data: payload });
      }
    }

    if (!this.vapidConfigured) {
      return;
    }

    const subscriptions = await this.pushSubscriptionModel
      .find({ accountId: ownerAccountId })
      .exec();

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            JSON.stringify({
              title: '바람비전 거래 요청',
              body: `${payload.itemName} / ${payload.price}전 / 거래 요청이 왔습니다.`,
              url: payload.url,
            }),
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;

          // 만료/해지된 구독은 정리하고, 그 외 실패는 로그만 남긴다.
          if (statusCode != null && GONE_STATUS_CODES.has(statusCode)) {
            await this.pushSubscriptionModel
              .deleteOne({ endpoint: subscription.endpoint })
              .exec()
              .catch(() => undefined);
          } else {
            this.logger.warn(`웹푸시 발송 실패 (${statusCode ?? 'unknown'})`);
          }
        }
      }),
    );
  }
}
