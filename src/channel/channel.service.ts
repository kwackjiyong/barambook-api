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
  private static readonly MOVE_COOLDOWN_MS = 700;
  private static readonly CHAT_COOLDOWN_MS = 5 * 60 * 1000;
  private static readonly WALKABLE_TILE_SET = new Set<string>(WALKABLE_TILES);

  private readonly participants = new Map<string, ChannelParticipant>();
  private readonly socketIdsByAccountId = new Map<string, string>();
  private readonly messages: ChannelChatMessage[] = [];
  private readonly lastMovedAt = new Map<string, number>();
  private readonly lastChattedAt = new Map<string, number>();

  addParticipant(member: Member, socketId: string): ChannelParticipant {
    const participant = this.createParticipant(member, socketId);
    this.participants.set(socketId, participant);
    this.socketIdsByAccountId.set(member.accountId, socketId);
    return participant;
  }

  findSocketIdByAccountId(accountId: string): string | null {
    return this.socketIdsByAccountId.get(accountId) ?? null;
  }

  removeParticipant(socketId: string): ChannelParticipant | null {
    const current = this.participants.get(socketId) ?? null;

    if (current) {
      this.participants.delete(socketId);
      if (this.socketIdsByAccountId.get(current.accountId) === socketId) {
        this.socketIdsByAccountId.delete(current.accountId);
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

    const now = Date.now();
    const lastMovedAt = this.lastMovedAt.get(socketId) ?? 0;

    if (now - lastMovedAt < ChannelService.MOVE_COOLDOWN_MS) {
      return null;
    }

    const dx = this.normalizeStep(payload.dx);
    const dy = this.normalizeStep(payload.dy);
    const direction = this.normalizeDirection(
      payload.direction,
      current.direction,
    );
    const nextX = this.clamp(current.x + dx, 0, ChannelService.MAP_WIDTH);
    const nextY = this.clamp(current.y + dy, 0, ChannelService.MAP_HEIGHT);

    if (!this.isWalkablePosition(nextX, nextY)) {
      return null;
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

    if (now - lastChattedAt < ChannelService.CHAT_COOLDOWN_MS) {
      return {
        error: 'Speech bubbles can only be updated once every 5 minutes.',
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

  getBootstrapPayload(socketId: string) {
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
      x: this.clamp(baseX + (column - 2) * 72, 0, ChannelService.MAP_WIDTH),
      y: this.clamp(baseY + row * 56, 0, ChannelService.MAP_HEIGHT),
      direction: 'down',
      connectedAt: new Date().toISOString(),
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
