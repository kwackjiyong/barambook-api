import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Namespace, Socket } from 'socket.io';
import { MemberService } from '../member/member.service';
import { UserService } from '../user/user.service';
import {
  ChannelRenderState,
  ChannelService,
  type ChannelMonster,
} from './channel.service';

interface MoveMessageBody {
  dx?: number;
  dy?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

interface ChatMessageBody {
  message?: string;
  isPinned?: boolean;
}

interface SpawnMonsterBody {
  name?: string;
}

type RenderSyncBody = Partial<ChannelRenderState>;

@WebSocketGateway({
  namespace: '/channel',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChannelGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChannelGateway.name);
  private monsterLoopTimer: NodeJS.Timeout | null = null;

  @WebSocketServer()
  private server!: Namespace;

  constructor(
    private readonly memberService: MemberService,
    private readonly userService: UserService,
    private readonly channelService: ChannelService,
  ) {
    this.startMonsterLoop();
  }

  async handleConnection(client: Socket): Promise<void> {
    const sessionToken = this.extractSessionToken(
      client.handshake.headers.cookie,
    );

    if (!sessionToken) {
      this.connectGuestParticipant(client);
      return;
    }

    try {
      const member =
        await this.memberService.findAuthenticatedMember(sessionToken);
      const likeCount = await this.userService.getLikeCountForName(
        member.representativeCharacterName ?? member.accountId,
      );
      const previousSocketId = this.channelService.findSocketIdByAccountId(
        member.accountId,
      );

      if (previousSocketId && previousSocketId !== client.id) {
        const previousSocket = this.server.sockets.get(previousSocketId);

        if (previousSocket) {
          previousSocket.emit('channel:error', {
            message: 'This account was connected from another session.',
          });
          previousSocket.disconnect(true);
        } else {
          this.channelService.removeParticipant(previousSocketId);
        }
      }

      const participant = this.channelService.addParticipant(
        member,
        client.id,
        likeCount,
      );

      client.emit(
        'channel:bootstrap',
        this.channelService.getBootstrapPayload(client.id),
      );
      client.broadcast.emit('channel:participant-joined', participant);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      this.logger.warn(`Falling back to guest channel access: ${client.id}`);
      this.connectGuestParticipant(client);
    }
  }

  handleDisconnect(client: Socket): void {
    const removed = this.channelService.removeParticipant(client.id);

    if (removed) {
      this.server.emit('channel:participant-left', {
        participantId: removed.id,
      });
    }
  }

  @SubscribeMessage('participant:move')
  handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MoveMessageBody,
  ): void {
    const participant = this.channelService.moveParticipant(client.id, payload);

    if (participant) {
      this.server.emit('channel:participant-moved', participant);
    }
  }

  @SubscribeMessage('chat:send')
  handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessageBody,
  ): void {
    const result = this.channelService.addMessage(
      client.id,
      payload?.message ?? '',
      payload?.isPinned === true,
    );

    if (result.error) {
      client.emit('channel:error', {
        message: result.error,
      });
      return;
    }

    if (result.message) {
      this.server.emit('channel:chat-message', result.message);
    }
  }

  @SubscribeMessage('chat:clear-pinned')
  handleClearPinnedChat(@ConnectedSocket() client: Socket): void {
    const message = this.channelService.clearPinnedMessage(client.id);

    if (message) {
      this.server.emit('channel:chat-message-updated', message);
    }
  }

  @SubscribeMessage('participant:render-sync')
  handleRenderSync(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RenderSyncBody,
  ): void {
    if (!this.isValidRenderSyncPayload(payload)) {
      return;
    }

    const participant = this.channelService.updateParticipantRender(
      client.id,
      payload,
    );

    if (participant) {
      this.server.emit('channel:participant-updated', participant);
    }
  }

  @SubscribeMessage('monster:spawn')
  handleMonsterSpawn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SpawnMonsterBody,
  ): void {
    if (!this.channelService.canManageMonster(client.id)) {
      client.emit('channel:error', {
        message: '몬스터 소환은 바람비전 운영자만 사용할 수 있습니다.',
      });
      return;
    }

    const result = this.channelService.spawnMonster(client.id, payload?.name);

    if (result.error) {
      client.emit('channel:error', { message: result.error });
      return;
    }

    if (result.monster) {
      this.server.emit('channel:monster-spawned', result.monster);
    }
  }

  private extractSessionToken(cookieHeader?: string): string | null {
    if (!cookieHeader) {
      return null;
    }

    const cookie = cookieHeader
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('barambook_session='));

    if (!cookie) {
      return null;
    }

    const [, rawValue = ''] = cookie.split('=');
    return decodeURIComponent(rawValue);
  }

  private connectGuestParticipant(client: Socket): void {
    const ipAddress = this.extractClientIp(client);

    if (!ipAddress) {
      client.emit('channel:error', {
        message: 'Unable to verify guest access for this connection.',
      });
      client.disconnect(true);
      return;
    }

    const previousGuestSocketId =
      this.channelService.findGuestSocketIdByIp(ipAddress);

    if (previousGuestSocketId && previousGuestSocketId !== client.id) {
      const previousGuestSocket = this.server.sockets.get(
        previousGuestSocketId,
      );

      if (previousGuestSocket) {
        client.emit('channel:error', {
          message: 'Guests cannot connect multiple times from the same IP.',
        });
        client.disconnect(true);
        return;
      }

      this.channelService.removeParticipant(previousGuestSocketId);
    }

    const participant = this.channelService.addGuestParticipant(
      client.id,
      ipAddress,
    );
    client.emit(
      'channel:bootstrap',
      this.channelService.getBootstrapPayload(client.id),
    );
    client.broadcast.emit('channel:participant-joined', participant);
  }

  private extractClientIp(client: Socket): string | null {
    const forwardedFor = client.handshake.headers['x-forwarded-for'];
    const firstForwardedIp =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]
        : Array.isArray(forwardedFor)
          ? forwardedFor[0]
          : null;
    const rawIp = (firstForwardedIp ?? client.handshake.address ?? '').trim();

    if (!rawIp) {
      return null;
    }

    return rawIp.replace(/^::ffff:/, '');
  }

  private isValidRenderSyncPayload(
    payload: RenderSyncBody,
  ): payload is ChannelRenderState {
    return (
      typeof payload?.head === 'number' &&
      typeof payload?.headc === 'number' &&
      typeof payload?.body === 'number' &&
      typeof payload?.bodyc === 'number' &&
      typeof payload?.weapon === 'number' &&
      typeof payload?.weaponc === 'number' &&
      (payload?.weaponrc === undefined ||
        typeof payload.weaponrc === 'number') &&
      typeof payload?.shield === 'number' &&
      typeof payload?.shieldc === 'number' &&
      this.isNullableString(payload?.emotionKey) &&
      this.isNullableString(payload?.emotionExpiresAt) &&
      this.isNullableNumber(payload?.attackSequence) &&
      this.isNullableString(payload?.attackExpiresAt) &&
      this.isNullableNumber(payload?.skillCode) &&
      this.isNullableString(payload?.skillExpiresAt)
    );
  }

  private isNullableNumber(value: unknown): value is number | null | undefined {
    return value === undefined || value === null || typeof value === 'number';
  }

  private isNullableString(value: unknown): value is string | null | undefined {
    return value === undefined || value === null || typeof value === 'string';
  }

  private startMonsterLoop() {
    this.monsterLoopTimer = setInterval(() => {
      const removedMonsters = this.channelService.removeExpiredMonsters();
      // const autoSpawnedMonster = this.channelService.autoSpawnMonster();
      const movedMonsters = this.channelService.moveMonsters();

      // if (autoSpawnedMonster) {
      //   this.server.emit('channel:monster-spawned', autoSpawnedMonster);
      // }

      for (const monster of removedMonsters) {
        this.emitMonsterRemoved(monster);
      }

      if (movedMonsters.length > 0) {
        this.server.emit('channel:monsters-moved', movedMonsters);
      }
    }, 200);
  }

  private emitMonsterRemoved(monster: ChannelMonster) {
    this.server.emit('channel:monster-removed', {
      monsterId: monster.id,
    });
  }
}
