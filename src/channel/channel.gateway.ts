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
import { ChannelRenderState, type ChannelMonster } from './channel.service';
import { ChannelWorldsService } from './channel-worlds.service';
import { normalizeChannelKey, type ChannelKey } from './map-collision';

interface MoveMessageBody {
  dx?: number;
  dy?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  isJumping?: boolean;
  isRiding?: boolean;
}

interface ChatMessageBody {
  message?: string;
  isPinned?: boolean;
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
    private readonly channelWorldsService: ChannelWorldsService,
  ) {
    this.startMonsterLoop();
  }

  async handleConnection(client: Socket): Promise<void> {
    const channelKey = normalizeChannelKey(client.handshake.query.channelKey);
    const channelService = this.channelWorldsService.get(channelKey);
    const roomName = this.getRoomName(channelKey);
    client.data.channelKey = channelKey;
    client.join(roomName);

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
        member.nickname ?? member.representativeCharacterName ?? member.accountId,
      );
      const previousSocketId = channelService.findSocketIdByAccountId(
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
          channelService.removeParticipant(previousSocketId);
        }
      }

      const participant = channelService.addParticipant(
        member,
        client.id,
        likeCount,
      );

      client.emit(
        'channel:bootstrap',
        channelService.getBootstrapPayload(client.id),
      );
      client.to(roomName).emit('channel:participant-joined', participant);
      this.broadcastPopulations();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      this.logger.warn(`Falling back to guest channel access: ${client.id}`);
      this.connectGuestParticipant(client);
    }
  }

  handleDisconnect(client: Socket): void {
    const channelKey = this.getClientChannelKey(client);
    const removed =
      this.channelWorldsService.get(channelKey).removeParticipant(client.id);

    if (removed) {
      this.server.to(this.getRoomName(channelKey)).emit('channel:participant-left', {
        participantId: removed.id,
      });
      this.broadcastPopulations();
    }
  }

  @SubscribeMessage('participant:move')
  handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MoveMessageBody,
  ): void {
    const channelKey = this.getClientChannelKey(client);
    const participant = this.channelWorldsService
      .get(channelKey)
      .moveParticipant(client.id, payload);

    if (participant) {
      this.server
        .to(this.getRoomName(channelKey))
        .emit('channel:participant-moved', participant);
    }
  }

  @SubscribeMessage('chat:send')
  handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessageBody,
  ): void {
    const channelKey = this.getClientChannelKey(client);
    const result = this.channelWorldsService
      .get(channelKey)
      .addMessage(
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
      this.server
        .to(this.getRoomName(channelKey))
        .emit('channel:chat-message', result.message);
    }
  }

  @SubscribeMessage('chat:clear-pinned')
  handleClearPinnedChat(@ConnectedSocket() client: Socket): void {
    const channelKey = this.getClientChannelKey(client);
    const message = this.channelWorldsService
      .get(channelKey)
      .clearPinnedMessage(client.id);

    if (message) {
      this.server
        .to(this.getRoomName(channelKey))
        .emit('channel:chat-message-updated', message);
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

    const channelKey = this.getClientChannelKey(client);
    const result = this.channelWorldsService
      .get(channelKey)
      .updateParticipantRender(client.id, payload);

    if (result.participant) {
      this.server
        .to(this.getRoomName(channelKey))
        .emit('channel:participant-updated', result.participant);
    }

    if (result.removedMonster) {
      this.emitMonsterRemoved(channelKey, result.removedMonster, 'hit');
    }
  }

  @SubscribeMessage('monster:spawn')
  handleMonsterSpawn(@ConnectedSocket() client: Socket): void {
    const channelKey = this.getClientChannelKey(client);
    const result = this.channelWorldsService
      .get(channelKey)
      .spawnMonster(client.id);

    if (result.error) {
      client.emit('channel:error', { message: result.error });
      return;
    }

    if (result.monster) {
      this.server
        .to(this.getRoomName(channelKey))
        .emit('channel:monster-spawned', result.monster);
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
    const channelKey = this.getClientChannelKey(client);
    const channelService = this.channelWorldsService.get(channelKey);
    const roomName = this.getRoomName(channelKey);
    const ipAddress = this.extractClientIp(client);

    if (!ipAddress) {
      client.emit('channel:error', {
        message: 'Unable to verify guest access for this connection.',
      });
      client.disconnect(true);
      return;
    }

    const previousGuestSocketId =
      channelService.findGuestSocketIdByIp(ipAddress);

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

      channelService.removeParticipant(previousGuestSocketId);
    }

    const participant = channelService.addGuestParticipant(
      client.id,
      ipAddress,
    );
    client.emit(
      'channel:bootstrap',
      channelService.getBootstrapPayload(client.id),
    );
    client.to(roomName).emit('channel:participant-joined', participant);
    this.broadcastPopulations();
  }

  private getChannelPopulations(): Record<string, number> {
    const populations: Record<string, number> = {};

    for (const [channelKey, channelService] of this.channelWorldsService.entries()) {
      populations[channelKey] = channelService.getParticipantCount();
    }

    return populations;
  }

  private broadcastPopulations(): void {
    if (!this.server) {
      return;
    }

    this.server.emit('channel:populations', this.getChannelPopulations());
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

  private getClientChannelKey(client: Socket): ChannelKey {
    return normalizeChannelKey(client.data.channelKey);
  }

  private getRoomName(channelKey: ChannelKey): string {
    return `channel:${channelKey}`;
  }

  private startMonsterLoop() {
    this.monsterLoopTimer = setInterval(() => {
      if (!this.server) {
        return;
      }

      for (const [channelKey, channelService] of this.channelWorldsService.entries()) {
        const removedMonsters = channelService.removeExpiredMonsters();
        const spawnedMonsters = channelService.maintainMonsterPopulation();
        const movedMonsters = channelService.moveMonsters();
        const roomName = this.getRoomName(channelKey);

        for (const monster of spawnedMonsters) {
          this.server.to(roomName).emit('channel:monster-spawned', monster);
        }

        for (const monster of removedMonsters) {
          this.emitMonsterRemoved(channelKey, monster, 'expired');
        }

        if (movedMonsters.length > 0) {
          this.server.to(roomName).emit('channel:monsters-moved', movedMonsters);
        }
      }
    }, 200);
  }

  private emitMonsterRemoved(
    channelKey: ChannelKey,
    monster: ChannelMonster,
    reason: 'expired' | 'hit',
  ) {
    this.server.to(this.getRoomName(channelKey)).emit('channel:monster-removed', {
      monsterId: monster.id,
      reason,
    });
  }
}
