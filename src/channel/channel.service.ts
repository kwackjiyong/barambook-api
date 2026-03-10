import { Injectable } from '@nestjs/common';
import { Member } from '../member/member.schema';

const WALKABLE_TILES = (
  require('../../../barambook/src/asset/map-data/45000_walkable_xy.json') as Array<{
    x: number;
    y: number;
  }>
).map((tile) => `${tile.x}:${tile.y}`);

export type ChannelDirection = 'up' | 'down' | 'left' | 'right';

export interface ChannelMonster {
  id: string;
  name: string;
  renderId: number;
  renderColor: number;
  x: number;
  y: number;
  direction: ChannelDirection;
  spawnedAt: string;
  expiresAt: string;
}

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
  emotionKey?: string | null;
  emotionExpiresAt?: string | null;
  attackSequence?: number | null;
  attackExpiresAt?: string | null;
  skillCode?: number | null;
  skillExpiresAt?: string | null;
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
  expiresAt?: string | null;
  isPinned?: boolean;
}

export interface ChannelChatResult {
  error?: string;
  message?: ChannelChatMessage;
}

export interface ChannelMonsterSpawnResult {
  error?: string;
  monster?: ChannelMonster;
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
  private static readonly AUTH_CHAT_COOLDOWN_MS = 200;
  private static readonly GUEST_CHAT_COOLDOWN_MS = 1000;
  private static readonly CHAT_BUBBLE_LIFETIME_MS = 6 * 1000;
  private static readonly MONSTER_LIFETIME_MS = 10 * 1000;
  private static readonly MONSTER_MOVE_INTERVAL_MS = 1200;
  private static readonly MONSTER_MOVE_STAGGER_MS = 900;
  private static readonly MONSTER_AUTO_SPAWN_INTERVAL_MS = 5 * 1000;
  private static readonly MAX_MONSTERS = 12;
  private static readonly MAX_MONSTER_RENDER_ID = 616;
  private static readonly MONSTER_RENDER_COLOR_COUNT = 3;
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
  private readonly monsters = new Map<string, ChannelMonster>();
  private readonly lastMovedAt = new Map<string, number>();
  private readonly lastChattedAt = new Map<string, number>();
  private readonly lastMonsterMovedAtById = new Map<string, number>();
  private lastMonsterSpawnedAt = 0;

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

  addMessage(
    socketId: string,
    rawMessage: string,
    isPinned = false,
  ): ChannelChatResult {
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
      sentAt: new Date(now).toISOString(),
      isPinned,
      expiresAt: isPinned
        ? null
        : new Date(now + ChannelService.CHAT_BUBBLE_LIFETIME_MS).toISOString(),
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

  clearPinnedMessage(socketId: string): ChannelChatMessage | null {
    const now = Date.now();

    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const message = this.messages[index];

      if (message.senderId !== socketId || message.isPinned !== true) {
        continue;
      }

      const nextMessage: ChannelChatMessage = {
        ...message,
        isPinned: false,
        expiresAt: new Date(now).toISOString(),
      };

      this.messages[index] = nextMessage;
      return nextMessage;
    }

    return null;
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
      monsters: Array.from(this.monsters.values()),
      messages: [...this.messages],
    };
  }

  spawnMonster(
    socketId?: string | null,
    requestedName?: string,
  ): ChannelMonsterSpawnResult {
    this.pruneExpiredMonsters();

    if (this.monsters.size >= ChannelService.MAX_MONSTERS) {
      return {
        error: '최대 12마리만 소환할 수 있습니다.',
      };
    }

    const spawnIndex = this.participants.size + this.monsters.size;
    const position = this.getSpawnPosition(spawnIndex);
    const now = Date.now();
    const preset = this.pickMonsterPreset(now, requestedName);
    const monster: ChannelMonster = {
      id: `monster:${now}:${Math.random().toString(36).slice(2, 8)}`,
      name: preset.name,
      renderId: preset.renderId,
      renderColor: preset.renderColor,
      x: position.x,
      y: position.y,
      direction: 'down',
      spawnedAt: new Date(now).toISOString(),
      expiresAt: new Date(
        now + ChannelService.MONSTER_LIFETIME_MS,
      ).toISOString(),
    };

    this.monsters.set(monster.id, monster);
    this.lastMonsterMovedAtById.set(
      monster.id,
      now -
        this.randomInt(
          0,
          Math.min(
            ChannelService.MONSTER_MOVE_STAGGER_MS,
            ChannelService.MONSTER_MOVE_INTERVAL_MS - 1,
          ),
        ),
    );
    this.lastMonsterSpawnedAt = now;
    return { monster };
  }

  removeMonster(monsterId: string): ChannelMonster | null {
    const monster = this.monsters.get(monsterId) ?? null;
    if (monster) {
      this.monsters.delete(monsterId);
      this.lastMonsterMovedAtById.delete(monsterId);
    }
    return monster;
  }

  removeExpiredMonsters(now = Date.now()): ChannelMonster[] {
    const removed: ChannelMonster[] = [];

    for (const monster of this.monsters.values()) {
      const expiresAt = new Date(monster.expiresAt).getTime();
      if (expiresAt <= now) {
        this.monsters.delete(monster.id);
        this.lastMonsterMovedAtById.delete(monster.id);
        removed.push(monster);
      }
    }

    return removed;
  }

  autoSpawnMonster(now = Date.now()): ChannelMonster | null {
    this.pruneExpiredMonsters(now);

    if (
      this.monsters.size >= ChannelService.MAX_MONSTERS ||
      now - this.lastMonsterSpawnedAt <
        ChannelService.MONSTER_AUTO_SPAWN_INTERVAL_MS
    ) {
      return null;
    }

    return this.spawnMonster(null).monster ?? null;
  }

  canManageMonster(socketId: string) {
    const participant = this.participants.get(socketId);

    return (
      participant?.isGuest !== true && participant?.displayName === '바람비전'
    );
  }
  moveMonsters(now = Date.now()): ChannelMonster[] {
    this.pruneExpiredMonsters(now);

    if (this.monsters.size === 0) {
      return [];
    }

    const moved: ChannelMonster[] = [];

    for (const monster of this.monsters.values()) {
      const lastMovedAt = this.lastMonsterMovedAtById.get(monster.id) ?? 0;

      if (now - lastMovedAt < ChannelService.MONSTER_MOVE_INTERVAL_MS) {
        continue;
      }

      const nextMonster = this.getNextMonsterPosition(monster);
      this.lastMonsterMovedAtById.set(monster.id, now);

      if (nextMonster) {
        this.monsters.set(nextMonster.id, nextMonster);
        moved.push(nextMonster);
      }
    }

    return moved;
  }

  private createParticipant(
    member: Member,
    socketId: string,
  ): ChannelParticipant {
    const position = this.getSpawnPosition(this.participants.size);

    return {
      id: socketId,
      accountId: member.accountId,
      displayName: member.representativeCharacterName ?? member.accountId,
      isGuest: false,
      x: position.x,
      y: position.y,
      direction: 'down',
      connectedAt: new Date().toISOString(),
    };
  }

  private createGuestParticipant(socketId: string): ChannelParticipant {
    const position = this.getSpawnPosition(this.participants.size);

    return {
      id: socketId,
      accountId: `guest:${socketId}`,
      displayName: '',
      isGuest: true,
      x: position.x,
      y: position.y,
      direction: 'down',
      connectedAt: new Date().toISOString(),
      renderState: ChannelService.DEFAULT_GUEST_RENDER_STATE,
    };
  }

  private getSpawnPosition(index: number) {
    const columnsPerRow = 6;
    const row = Math.floor(index / columnsPerRow);
    const column = index % columnsPerRow;
    const baseTileX = 25;
    const baseTileY = 130;
    const tileOffsetX = (column - 2) * 3;
    const tileOffsetY = row * 2;

    return {
      x: this.clamp(
        (baseTileX + tileOffsetX) * ChannelService.TILE_SIZE,
        0,
        ChannelService.MAP_WIDTH,
      ),
      y: this.clamp(
        (baseTileY + tileOffsetY) * ChannelService.TILE_SIZE,
        0,
        ChannelService.MAP_HEIGHT,
      ),
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

  private pruneExpiredMonsters(now = Date.now()) {
    for (const monster of this.monsters.values()) {
      const expiresAt = new Date(monster.expiresAt).getTime();
      if (expiresAt <= now) {
        this.monsters.delete(monster.id);
        this.lastMonsterMovedAtById.delete(monster.id);
      }
    }
  }

  private randomInt(min: number, max: number) {
    if (max <= min) {
      return min;
    }

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private pickMonsterPreset(now: number, requestedName?: string) {
    const normalizedName = requestedName?.trim();
    const randomSeed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const renderId =
      (now + randomSeed) % (ChannelService.MAX_MONSTER_RENDER_ID + 1);
    const renderColor =
      (now + randomSeed) % ChannelService.MONSTER_RENDER_COLOR_COUNT;

    return {
      name:
        normalizedName && normalizedName.length > 0
          ? normalizedName
          : `monster:${renderId}`,
      renderId,
      renderColor,
    };
  }
  private getNextMonsterPosition(
    monster: ChannelMonster,
  ): ChannelMonster | null {
    const candidates: Array<{
      dx: number;
      dy: number;
      direction: ChannelDirection;
    }> = [
      { dx: 0, dy: -ChannelService.TILE_SIZE, direction: 'up' },
      { dx: 0, dy: ChannelService.TILE_SIZE, direction: 'down' },
      { dx: -ChannelService.TILE_SIZE, dy: 0, direction: 'left' },
      { dx: ChannelService.TILE_SIZE, dy: 0, direction: 'right' },
    ];
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    for (const candidate of shuffled) {
      const nextX = this.clamp(
        monster.x + candidate.dx,
        0,
        ChannelService.MAP_WIDTH,
      );
      const nextY = this.clamp(
        monster.y + candidate.dy,
        0,
        ChannelService.MAP_HEIGHT,
      );
      if (!this.isWalkablePosition(nextX, nextY)) {
        continue;
      }

      return {
        ...monster,
        x: nextX,
        y: nextY,
        direction: candidate.direction,
      };
    }

    const fallbackDirection =
      shuffled[Math.floor(Math.random() * shuffled.length)]?.direction ??
      monster.direction;
    if (fallbackDirection === monster.direction) {
      return null;
    }

    return {
      ...monster,
      direction: fallbackDirection,
    };
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
