import { Injectable } from '@nestjs/common';
import { Member } from '../member/member.schema';

export type ChannelDirection = 'up' | 'down' | 'left' | 'right';

export interface ChannelRenderInput {
  head: number;
  headc: string;
  body: string;
  bodyc: string;
  weapon: string;
  weaponc: string;
  shield: string;
  frame: 'b' | 'r' | 'f' | 'l';
  type:
    | 'n'
    | 'w'
    | 'p'
    | 'b'
    | 'm'
    | 'g'
    | 'h'
    | 'e'
    | 'e_a'
    | 'e_b'
    | 'e_c'
    | 'e_d'
    | 'e_e'
    | 'e_f'
    | 'e_g'
    | 'e_h'
    | 'e_i'
    | 'e_j'
    | 'e_k'
    | 'e_l'
    | 'e_m'
    | 'e_n'
    | 'e_o'
    | 'e_p';
  isAction: 'Y' | 'N';
}

export interface ChannelParticipant {
  id: string;
  accountId: string;
  displayName: string;
  x: number;
  y: number;
  direction: ChannelDirection;
  connectedAt: string;
  renderInput?: ChannelRenderInput;
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
  private static readonly MAX_STEP = 24;
  private static readonly MAX_MESSAGE_LENGTH = 120;
  private static readonly MAX_MESSAGE_HISTORY = 50;
  private static readonly MOVE_COOLDOWN_MS = 700;
  private static readonly CHAT_COOLDOWN_MS = 5 * 60 * 1000;

  private readonly participants = new Map<string, ChannelParticipant>();
  private readonly messages: ChannelChatMessage[] = [];
  private readonly lastMovedAt = new Map<string, number>();
  private readonly lastChattedAt = new Map<string, number>();

  addParticipant(member: Member, socketId: string): ChannelParticipant {
    const participant = this.createParticipant(member, socketId);
    this.participants.set(socketId, participant);
    return participant;
  }

  removeParticipant(socketId: string): ChannelParticipant | null {
    const current = this.participants.get(socketId) ?? null;

    if (current) {
      this.participants.delete(socketId);
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

    const nextParticipant: ChannelParticipant = {
      ...current,
      x: this.clamp(current.x + dx, 0, ChannelService.MAP_WIDTH),
      y: this.clamp(current.y + dy, 0, ChannelService.MAP_HEIGHT),
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
    renderInput: ChannelRenderInput,
  ): ChannelParticipant | null {
    const current = this.participants.get(socketId);

    if (!current) {
      return null;
    }

    const nextParticipant: ChannelParticipant = {
      ...current,
      renderInput,
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
    const baseX = 2520;
    const baseY = 2280;

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
}
