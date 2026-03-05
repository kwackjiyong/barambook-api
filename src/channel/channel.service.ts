import { Injectable } from '@nestjs/common';
import { Member } from '../member/member.schema';

const WALKABLE_TILES = (
  require('../../../barambook/src/asset/map-data/45000_walkable_xy_noextra.json') as Array<{
    x: number;
    y: number;
  }>
).map((tile) => `${tile.x}:${tile.y}`);

export type ChannelDirection = 'up' | 'down' | 'left' | 'right';

export interface ChannelRenderState {
  head: number;
  headc: number;
  body: number;
  bodyc: number;
  weapon: number;
  weaponc: number;
  weaponrc?: number;
  shield: number;
  shieldc: number;
}

export interface ChannelParticipant {
  id: string;
  accountId: string;
  displayName: string;
  isGuest: boolean;
  x: number;
  y: number;
  direction: ChannelDirection;
  connectedAt: string;
  renderState?: ChannelRenderState;
}

export interface ChannelChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  sentAt: string;
}

export interface ChannelChatResult {
  error?: string;
  message?: ChannelChatMessage;
}

interface MovePayload {
  dx?: number;
  dy?: number;
  direction?: ChannelDirection;
}

@Injectable()
export class ChannelService {
  private static readonly MAP_WIDTH = 5280;
  private static readonly MAP_HEIGHT = 4800;
  private static readonly TILE_SIZE = 24;
  private static readonly MAX_STEP = 24;
  private static readonly MAX_MESSAGE_LENGTH = 50;
  private static readonly MAX_MESSAGE_HISTORY = 50;
  private static readonly MOVE_COOLDOWN_MS = 240;
  private static readonly AUTH_CHAT_COOLDOWN_MS = 1 * 1000;
  private static readonly GUEST_CHAT_COOLDOWN_MS = 5 * 1000;
  private static readonly WALKABLE_TILE_SET = new Set<string>(WALKABLE_TILES);
  private static readonly DEFAULT_GUEST_RENDER_STATE: ChannelRenderState = {
    head: 0,
    headc: 32,
    body: 2,
    bodyc: 0,
    weapon: 1,
    weaponc: 0,
    shield: 1,
    shieldc: 0,
  };

  private readonly participants = new Map<string, ChannelParticipant>();
  private readonly socketIdsByAccountId = new Map<string, string>();
  private readonly guestSocketIdsByIp = new Map<string, string>();
  private readonly guestIpsBySocketId = new Map<string, string>();
  private readonly messages: ChannelChatMessage[] = [];
  private readonly lastMovedAt = new Map<string, number>();
  private readonly lastChattedAt = new Map<string, number>();

  addParticipant(member: Member, socketId: string): ChannelParticipant {
    const participant = this.createParticipant(member, socketId);
    this.participants.set(socketId, participant);
    this.socketIdsByAccountId.set(member.accountId, socketId);
    return participant;
  }

  addGuestParticipant(socketId: string, ipAddress: string): ChannelParticipant {
    const participant = this.createGuestParticipant(socketId);
    this.participants.set(socketId, participant);
    this.guestSocketIdsByIp.set(ipAddress, socketId);
    this.guestIpsBySocketId.set(socketId, ipAddress);
    return participant;
  }

  findSocketIdByAccountId(accountId: string): string | null {
    return this.socketIdsByAccountId.get(accountId) ?? null;
  }

  findGuestSocketIdByIp(ipAddress: string): string | null {
    return this.guestSocketIdsByIp.get(ipAddress) ?? null;
  }

  removeParticipant(socketId: string): ChannelParticipant | null {
    const current = this.participants.get(socketId) ?? null;

    if (current) {
      this.participants.delete(socketId);
      if (this.socketIdsByAccountId.get(current.accountId) === socketId) {
        this.socketIdsByAccountId.delete(current.accountId);
      }
      const guestIpAddress = this.guestIpsBySocketId.get(socketId);
      if (guestIpAddress) {
        if (this.guestSocketIdsByIp.get(guestIpAddress) === socketId) {
          this.guestSocketIdsByIp.delete(guestIpAddress);
        }
        this.guestIpsBySocketId.delete(socketId);
      }
      this.lastMovedAt.delete(socketId);
      this.lastChattedAt.delete(socketId);
    }

    return current;
  }

  moveParticipant(
    socketId: string,
    payload: MovePayload,
  ): ChannelParticipant | null {
    const current = this.participants.get(socketId);

    if (!current) {
      return null;
    }

    const dx = this.normalizeStep(payload.dx);
    const dy = this.normalizeStep(payload.dy);
    const direction = this.normalizeDirection(
      payload.direction,
      current.direction,
    );
    const now = Date.now();
    const lastMovedAt = this.lastMovedAt.get(socketId) ?? 0;
    const isMoveRequested = dx !== 0 || dy !== 0;
    const isDirectionChanged = direction !== current.direction;

    if (now - lastMovedAt < ChannelService.MOVE_COOLDOWN_MS) {
      if (!isDirectionChanged) {
        return null;
      }

      const rotatedParticipant: ChannelParticipant = {
        ...current,
        direction,
      };
      this.participants.set(socketId, rotatedParticipant);
      return rotatedParticipant;
    }

    const nextX = this.clamp(current.x + dx, 0, ChannelService.MAP_WIDTH);
    const nextY = this.clamp(current.y + dy, 0, ChannelService.MAP_HEIGHT);

    if (!isMoveRequested) {
      if (!isDirectionChanged) {
        return null;
      }

      const rotatedParticipant: ChannelParticipant = {
        ...current,
        direction,
      };
      this.participants.set(socketId, rotatedParticipant);
      return rotatedParticipant;
    }

    if (!this.isWalkablePosition(nextX, nextY)) {
      if (!isDirectionChanged) {
        return null;
      }

      const rotatedParticipant: ChannelParticipant = {
        ...current,
        direction,
      };
      this.participants.set(socketId, rotatedParticipant);
      return rotatedParticipant;
    }

    const nextParticipant: ChannelParticipant = {
      ...current,
      x: nextX,
      y: nextY,
      direction,
    };

    this.participants.set(socketId, nextParticipant);
    this.lastMovedAt.set(socketId, now);
    return nextParticipant;
  }

  addMessage(socketId: string, rawMessage: string): ChannelChatResult {
    const sender = this.participants.get(socketId);
    const message = rawMessage
      .trim()
      .slice(0, ChannelService.MAX_MESSAGE_LENGTH);

    if (!sender || !message) {
      return {};
    }

    const now = Date.now();
    const lastChattedAt = this.lastChattedAt.get(socketId) ?? 0;
    const chatCooldownMs = sender.isGuest
      ? ChannelService.GUEST_CHAT_COOLDOWN_MS
      : ChannelService.AUTH_CHAT_COOLDOWN_MS;

    if (now - lastChattedAt < chatCooldownMs) {
      return {
        error: sender.isGuest
          ? '\uac8c\uc2a4\ud2b8\ub294 \ucc44\ud305\uc744 5\ucd08\uc5d0 \ud55c \ubc88\ub9cc \ubcf4\ub0bc \uc218 \uc788\uc2b5\ub2c8\ub2e4.'
          : '\ub85c\uadf8\uc778 \uc0ac\uc6a9\uc790\ub294 \ucc44\ud305\uc744 1\ucd08\uc5d0 \ud55c \ubc88\ub9cc \ubcf4\ub0bc \uc218 \uc788\uc2b5\ub2c8\ub2e4.',
      };
    }

    const nextMessage: ChannelChatMessage = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: sender.id,
      senderName: sender.displayName,
      message,
      sentAt: new Date().toISOString(),
    };

    this.messages.push(nextMessage);

    if (this.messages.length > ChannelService.MAX_MESSAGE_HISTORY) {
      this.messages.splice(
        0,
        this.messages.length - ChannelService.MAX_MESSAGE_HISTORY,
      );
    }

    this.lastChattedAt.set(socketId, now);
    return { message: nextMessage };
  }

  updateParticipantRender(
    socketId: string,
    renderState: ChannelRenderState,
  ): ChannelParticipant | null {
    const current = this.participants.get(socketId);

    if (!current) {
      return null;
    }

    const nextParticipant: ChannelParticipant = {
      ...current,
      renderState,
    };

    this.participants.set(socketId, nextParticipant);
    return nextParticipant;
  }

  getBootstrapPayload(socketId: string | null = null) {
    return {
      currentParticipantId: socketId,
      participants: Array.from(this.participants.values()),
      messages: [...this.messages],
    };
  }

  private createParticipant(
    member: Member,
    socketId: string,
  ): ChannelParticipant {
    const index = this.participants.size;
    const row = Math.floor(index / 6);
    const column = index % 6;
    const baseX = 25 * ChannelService.TILE_SIZE;
    const baseY = 130 * ChannelService.TILE_SIZE;

    return {
      id: socketId,
      accountId: member.accountId,
      displayName: member.representativeCharacterName ?? member.accountId,
      isGuest: false,
      x: this.clamp(baseX + (column - 2) * 72, 0, ChannelService.MAP_WIDTH),
      y: this.clamp(baseY + row * 56, 0, ChannelService.MAP_HEIGHT),
      direction: 'down',
      connectedAt: new Date().toISOString(),
    };
  }

  private createGuestParticipant(socketId: string): ChannelParticipant {
    const index = this.participants.size;
    const row = Math.floor(index / 6);
    const column = index % 6;
    const baseX = 25 * ChannelService.TILE_SIZE;
    const baseY = 130 * ChannelService.TILE_SIZE;

    return {
      id: socketId,
      accountId: `guest:${socketId}`,
      displayName: '',
      isGuest: true,
      x: this.clamp(baseX + (column - 2) * 72, 0, ChannelService.MAP_WIDTH),
      y: this.clamp(baseY + row * 56, 0, ChannelService.MAP_HEIGHT),
      direction: 'down',
      connectedAt: new Date().toISOString(),
      renderState: ChannelService.DEFAULT_GUEST_RENDER_STATE,
    };
  }

  private normalizeStep(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }

    return this.clamp(
      Math.round(value),
      -ChannelService.MAX_STEP,
      ChannelService.MAX_STEP,
    );
  }

  private normalizeDirection(
    value: ChannelDirection | undefined,
    fallback: ChannelDirection,
  ): ChannelDirection {
    if (
      value === 'up' ||
      value === 'down' ||
      value === 'left' ||
      value === 'right'
    ) {
      return value;
    }

    return fallback;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private isWalkablePosition(x: number, y: number): boolean {
    if (
      x % ChannelService.TILE_SIZE !== 0 ||
      y % ChannelService.TILE_SIZE !== 0
    ) {
      return false;
    }

    const tileX = x / ChannelService.TILE_SIZE;
    const tileY = y / ChannelService.TILE_SIZE;
    return ChannelService.WALKABLE_TILE_SET.has(`${tileX}:${tileY}`);
  }
}
