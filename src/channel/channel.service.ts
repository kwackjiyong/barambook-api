import { Injectable } from '@nestjs/common';
import { Member } from '../member/member.schema';
import { resolveGrade, type MemberGrade } from '../member/grade';
import {
  BUYEO_MAP_CONFIG,
  buildFallbackCollision,
  type MapCollision,
  type MapConfig,
} from './map-collision';

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
  /**
   * 자동 개체수 유지(야생 몬스터) 대상이면 프리셋 식별자가 채워진다.
   * 운영자가 수동으로 소환한 몬스터에는 존재하지 않는다.
   */
  presetKey?: string;
}

/**
 * 맵에 주기적으로 뿌릴 야생 몬스터 프리셋.
 * count 만큼 개체수가 유지되도록 부족분을 자동으로 채운다.
 */
interface MonsterPopulationPreset {
  name: string;
  renderId: number;
  renderColor: number;
  count: number;
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
  skinc?: number;
  /** 메월(char-ms) 데이터로 추가된 외형. 예전 클라이언트는 보내지 않는다. */
  headMode?: 'head' | 'face-hair';
  face?: number;
  hair?: number;
  hairc?: number;
  riding?: number;
  bodyDye?: number;
  weaponDye?: number;
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
  likeCount: number;
  isGuest: boolean;
  isOperator?: boolean;
  grade?: MemberGrade;
  isJumping?: boolean;
  /** 장시간 무활동(이동/채팅 없음) 상태. 활동 접속자수 집계와 잠수 표시에 쓰인다. */
  isAfk?: boolean;
  /** 실제 채널 화면 없이 전역 대기실 채팅 위젯으로만 연결된 참가자. */
  isLobbyChatOnly?: boolean;
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
  senderLikeCount: number;
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

export interface ChannelRenderUpdateResult {
  participant?: ChannelParticipant;
  removedMonster?: ChannelMonster;
}

interface MovePayload {
  dx?: number;
  dy?: number;
  direction?: ChannelDirection;
  isJumping?: boolean;
  isRiding?: boolean;
}

@Injectable()
export class ChannelService {
  private static readonly TILE_SIZE = 24;
  private static readonly MAX_STEP = 24;
  private static readonly MAX_MESSAGE_LENGTH = 50;
  private static readonly MAX_MESSAGE_HISTORY = 50;
  private static readonly MOVE_COOLDOWN_MS = 240;
  // 말타기(클라이언트의 지속 모션 'h') 상태에서는 이동 쿨다운을 절반으로 줄여 2배 속도로 움직인다.
  private static readonly RIDE_MOVE_COOLDOWN_MS = 120;
  private static readonly AUTH_CHAT_COOLDOWN_MS = 200;
  private static readonly GUEST_CHAT_COOLDOWN_MS = 1000;
  // 이 시간 동안 이동/채팅이 없으면 잠수(isAfk) 상태로 전환한다.
  private static readonly AFK_THRESHOLD_MS = 60 * 60 * 1000;
  private static readonly CHAT_BUBBLE_LIFETIME_MS = 6 * 1000;
  private static readonly MONSTER_LIFETIME_MS = 30 * 1000;
  // 한 타일 이동 간격(클수록 느리게 움직인다).
  private static readonly MONSTER_MOVE_INTERVAL_MS = 2000;
  private static readonly MONSTER_MOVE_STAGGER_MS = 1800;
  private static readonly MAX_MONSTERS = 120;
  // 야생 몬스터 개체수 유지 설정
  private static readonly MONSTER_POPULATION_REFILL_INTERVAL_MS = 500;
  private static readonly MONSTER_POPULATION_SPAWN_BATCH = 6;
  private static readonly MONSTER_POPULATION_SPAWN_MAX_ATTEMPTS = 80;
  // 개체수 유지 몬스터는 만료되지 않는 영구 객체로 취급한다.
  private static readonly PERSISTENT_MONSTER_EXPIRES_AT =
    '2099-12-31T23:59:59.999Z';
  private static readonly MONSTER_SPAWN_DISABLED_ERROR =
    '몬스터 소환 기능은 현재 비활성화되어 있습니다.';
  private static readonly RACCOON_VILLAGE_MONSTER_POPULATION_PRESETS: MonsterPopulationPreset[] =
    [
      { name: '토끼', renderId: 21, renderColor: 11, count: 10 },
      { name: '다람쥐', renderId: 25, renderColor: 5, count: 10 },
    ];
  private static readonly MAX_MONSTER_RENDER_ID = 616;
  private static readonly MONSTER_RENDER_COLOR_COUNT = 3;
  private static readonly ATTACK_HIT_FORWARD_RANGE =
    ChannelService.TILE_SIZE * 1.35;
  private static readonly ATTACK_HIT_LATERAL_RANGE =
    ChannelService.TILE_SIZE * 0.9;
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
  private readonly lastActiveAt = new Map<string, number>();
  private readonly lastMonsterMovedAtById = new Map<string, number>();
  private lastPopulationRefillAt = 0;

  private readonly collision: MapCollision;
  private readonly respawnCenterTileX: number;
  private readonly respawnCenterTileY: number;
  private readonly monsterPopulationPresets: MonsterPopulationPreset[];

  constructor(
    config: MapConfig = BUYEO_MAP_CONFIG,
    collision: MapCollision = buildFallbackCollision(BUYEO_MAP_CONFIG),
  ) {
    this.collision = collision;
    this.respawnCenterTileX = config.respawnCenterTileX;
    this.respawnCenterTileY = config.respawnCenterTileY;
    this.monsterPopulationPresets =
      config.channelKey === '67000'
        ? ChannelService.RACCOON_VILLAGE_MONSTER_POPULATION_PRESETS
        : [];
  }

  private get maxTileX(): number {
    return this.collision.width - 1;
  }

  private get maxTileY(): number {
    return this.collision.height - 1;
  }

  private get mapTileWidth(): number {
    return this.collision.width;
  }

  private get mapTileHeight(): number {
    return this.collision.height;
  }

  private get maxPositionX(): number {
    return this.maxTileX * ChannelService.TILE_SIZE;
  }

  private get maxPositionY(): number {
    return this.maxTileY * ChannelService.TILE_SIZE;
  }

  addParticipant(
    member: Member,
    socketId: string,
    likeCount: number,
    isLobbyChatOnly = false,
  ): ChannelParticipant {
    const participant = this.createParticipant(
      member,
      socketId,
      likeCount,
      isLobbyChatOnly,
    );
    this.participants.set(socketId, participant);
    this.socketIdsByAccountId.set(member.accountId, socketId);
    this.lastActiveAt.set(socketId, Date.now());
    return participant;
  }

  addGuestParticipant(
    socketId: string,
    ipAddress: string,
    isLobbyChatOnly = false,
  ): ChannelParticipant {
    const participant = this.createGuestParticipant(socketId, isLobbyChatOnly);
    this.participants.set(socketId, participant);
    this.guestSocketIdsByIp.set(ipAddress, socketId);
    this.guestIpsBySocketId.set(socketId, ipAddress);
    this.lastActiveAt.set(socketId, Date.now());
    return participant;
  }

  findSocketIdByAccountId(accountId: string): string | null {
    return this.socketIdsByAccountId.get(accountId) ?? null;
  }

  getParticipantCount(): number {
    return this.participants.size;
  }

  /** 대기실 채팅 위젯 전용 연결을 제외한, 바카오톡 화면에 실제로 접속한 인원 수. */
  getChannelParticipantCount(): number {
    let count = 0;

    for (const participant of this.participants.values()) {
      if (participant.isLobbyChatOnly !== true) {
        count += 1;
      }
    }

    return count;
  }

  getParticipantSocketIds(): string[] {
    return Array.from(this.participants.keys());
  }

  /**
   * 참가자의 활동 시각을 갱신한다. 잠수 상태였다면 해제하고
   * 갱신된 참가자를 반환해 게이트웨이가 브로드캐스트할 수 있게 한다.
   */
  touchActivity(socketId: string): ChannelParticipant | null {
    const current = this.participants.get(socketId);

    if (!current) {
      return null;
    }

    this.lastActiveAt.set(socketId, Date.now());

    if (current.isAfk !== true) {
      return null;
    }

    const awakened: ChannelParticipant = { ...current, isAfk: false };
    this.participants.set(socketId, awakened);
    return awakened;
  }

  updateParticipantGrade(
    socketId: string,
    point: number,
  ): ChannelParticipant | null {
    const current = this.participants.get(socketId);

    if (!current || current.isGuest) {
      return null;
    }

    const grade = resolveGrade(point, current.isOperator === true);

    if (
      current.grade?.id === grade.id &&
      current.grade?.isMaster === grade.isMaster
    ) {
      return null;
    }

    const updated = { ...current, grade };
    this.participants.set(socketId, updated);
    return updated;
  }

  /** 활동 기한이 지난 참가자를 잠수 상태로 전환하고, 새로 잠수가 된 참가자만 반환한다. */
  markIdleParticipantsAsAfk(now = Date.now()): ChannelParticipant[] {
    const marked: ChannelParticipant[] = [];

    for (const [socketId, participant] of this.participants) {
      if (participant.isAfk === true) {
        continue;
      }

      const lastActiveAt = this.lastActiveAt.get(socketId);

      if (lastActiveAt === undefined) {
        this.lastActiveAt.set(socketId, now);
        continue;
      }

      if (now - lastActiveAt < ChannelService.AFK_THRESHOLD_MS) {
        continue;
      }

      const next: ChannelParticipant = { ...participant, isAfk: true };
      this.participants.set(socketId, next);
      marked.push(next);
    }

    return marked;
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
      this.lastActiveAt.delete(socketId);
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
    const isJumping = payload.isJumping === true;
    const isRiding = payload.isRiding === true;
    const moveCooldownMs = isRiding
      ? ChannelService.RIDE_MOVE_COOLDOWN_MS
      : ChannelService.MOVE_COOLDOWN_MS;
    const now = Date.now();
    const lastMovedAt = this.lastMovedAt.get(socketId) ?? 0;
    const isMoveRequested = dx !== 0 || dy !== 0;
    const isDirectionChanged = direction !== current.direction;
    const isJumpStateChanged = isJumping !== (current.isJumping === true);
    const elapsedSinceLastMove = now - lastMovedAt;

    // 말타기는 다음 칸으로 더 빨리 이동하지만 화면의 한 칸 애니메이션은 동일하게 240ms다.
    // 그 전에 방향만 먼저 바뀌면 클라이언트 보간이 진행 동선을 잘라 대각선으로 꺾여 보인다.
    if (
      isDirectionChanged &&
      elapsedSinceLastMove < ChannelService.MOVE_COOLDOWN_MS
    ) {
      if (!isJumpStateChanged) {
        return null;
      }

      const rotatedParticipant: ChannelParticipant = {
        ...current,
        isJumping,
      };
      this.participants.set(socketId, rotatedParticipant);
      return rotatedParticipant;
    }

    if (elapsedSinceLastMove < moveCooldownMs) {
      // 점프 시작/종료 신호는 이동과 독립적이므로 현재 위치와 방향을 유지한 채 반영한다.
      if (!isJumpStateChanged) {
        return null;
      }

      const jumpedParticipant: ChannelParticipant = {
        ...current,
        isJumping,
      };
      this.participants.set(socketId, jumpedParticipant);
      return jumpedParticipant;
    }

    const nextX = this.clamp(current.x + dx, 0, this.maxPositionX);
    const nextY = this.clamp(current.y + dy, 0, this.maxPositionY);

    if (!isMoveRequested) {
      if (!isDirectionChanged && !isJumpStateChanged) {
        return null;
      }

      const rotatedParticipant: ChannelParticipant = {
        ...current,
        direction,
        isJumping,
      };
      this.participants.set(socketId, rotatedParticipant);
      return rotatedParticipant;
    }

    if (!this.canTraverse(current.x, current.y, dx, dy)) {
      if (!isDirectionChanged && !isJumpStateChanged) {
        return null;
      }

      const rotatedParticipant: ChannelParticipant = {
        ...current,
        direction,
        isJumping,
      };
      this.participants.set(socketId, rotatedParticipant);
      return rotatedParticipant;
    }

    const nextParticipant: ChannelParticipant = {
      ...current,
      x: nextX,
      y: nextY,
      direction,
      isJumping,
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
      senderLikeCount: sender.likeCount,
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
  ): ChannelRenderUpdateResult {
    const current = this.participants.get(socketId);

    if (!current) {
      return {};
    }

    const nextParticipant: ChannelParticipant = {
      ...current,
      renderState,
    };
    const removedMonster = this.tryRemoveMonsterHitByAttack(
      current,
      current.renderState,
      renderState,
    );

    this.participants.set(socketId, nextParticipant);
    return {
      participant: nextParticipant,
      removedMonster: removedMonster ?? undefined,
    };
  }

  getBootstrapPayload(socketId: string | null = null) {
    return {
      currentParticipantId: socketId,
      participants: Array.from(this.participants.values()),
      monsters: Array.from(this.monsters.values()),
      messages: [...this.messages],
    };
  }

  spawnMonster(socketId?: string | null): ChannelMonsterSpawnResult {
    this.pruneExpiredMonsters();

    const participant = socketId
      ? (this.participants.get(socketId) ?? null)
      : null;

    if (socketId && !participant) {
      return {
        error: '몬스터를 소환할 수 있는 사용자를 찾을 수 없습니다.',
      };
    }

    if (participant && !this.isMonsterSpawnOperator(participant)) {
      return {
        error: '몬스터 소환은 운영자만 사용할 수 있습니다.',
      };
    }

    return {
      error: ChannelService.MONSTER_SPAWN_DISABLED_ERROR,
    };
  }

  removeMonster(monsterId: string): ChannelMonster | null {
    const monster = this.monsters.get(monsterId) ?? null;
    if (monster) {
      this.detachMonster(monsterId);
    }
    return monster;
  }

  removeExpiredMonsters(now = Date.now()): ChannelMonster[] {
    const removed: ChannelMonster[] = [];

    for (const monster of this.monsters.values()) {
      if (this.shouldRemovePopulationMonster(monster)) {
        this.detachMonster(monster.id);
        removed.push(monster);
        continue;
      }

      if (this.isPersistentMonster(monster)) {
        continue;
      }

      const expiresAt = new Date(monster.expiresAt).getTime();
      if (expiresAt <= now) {
        this.detachMonster(monster.id);
        removed.push(monster);
      }
    }

    return removed;
  }

  /**
   * 야생 몬스터 개체수를 프리셋에 정의된 수만큼 유지한다.
   * 일정 주기마다 부족한 종류를 맵상의 이동 가능한 임의 위치에 채워 넣고,
   * 한 번에 너무 많이 몰려서 생성되지 않도록 배치 단위로 나눠 스폰한다.
   * @returns 이번 호출에서 새로 생성된 몬스터 목록
   */
  maintainMonsterPopulation(now = Date.now()): ChannelMonster[] {
    this.pruneExpiredMonsters(now);

    if (
      now - this.lastPopulationRefillAt <
      ChannelService.MONSTER_POPULATION_REFILL_INTERVAL_MS
    ) {
      return [];
    }

    this.lastPopulationRefillAt = now;

    const spawned: ChannelMonster[] = [];

    for (const preset of this.monsterPopulationPresets) {
      let deficit = preset.count - this.countMonsterPopulation(preset.name);

      while (
        deficit > 0 &&
        spawned.length < ChannelService.MONSTER_POPULATION_SPAWN_BATCH &&
        this.monsters.size < ChannelService.MAX_MONSTERS
      ) {
        const monster = this.spawnPopulationMonster(preset, now);

        if (!monster) {
          break;
        }

        spawned.push(monster);
        deficit -= 1;
      }

      if (
        spawned.length >= ChannelService.MONSTER_POPULATION_SPAWN_BATCH ||
        this.monsters.size >= ChannelService.MAX_MONSTERS
      ) {
        break;
      }
    }

    return spawned;
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
    likeCount: number,
    isLobbyChatOnly: boolean,
  ): ChannelParticipant {
    const position = this.getSpawnPosition(this.participants.size);

    return {
      id: socketId,
      accountId: member.accountId,
      displayName:
        member.nickname ??
        member.representativeCharacterName ??
        member.accountId,
      likeCount,
      isGuest: false,
      isOperator: member.isOperator === true,
      grade: resolveGrade(member.point ?? 0, member.isOperator === true),
      isLobbyChatOnly,
      x: position.x,
      y: position.y,
      direction: 'down',
      connectedAt: new Date().toISOString(),
    };
  }

  private createGuestParticipant(
    socketId: string,
    isLobbyChatOnly: boolean,
  ): ChannelParticipant {
    const position = this.getSpawnPosition(this.participants.size);

    return {
      id: socketId,
      accountId: `guest:${socketId}`,
      displayName: '',
      likeCount: 0,
      isGuest: true,
      isLobbyChatOnly,
      x: position.x,
      y: position.y,
      direction: 'down',
      connectedAt: new Date().toISOString(),
      renderState: ChannelService.DEFAULT_GUEST_RENDER_STATE,
    };
  }

  private getSpawnPosition(index: number) {
    const tile = this.findNearbyWalkableTile(
      this.respawnCenterTileX,
      this.respawnCenterTileY,
      index,
    );

    return this.toWorldPosition(tile.x, tile.y);
  }

  private getMonsterSpawnPosition() {
    const tile = this.findNearbyWalkableTile(
      this.respawnCenterTileX,
      this.respawnCenterTileY,
      this.monsters.size,
      2,
    );

    return this.toWorldPosition(tile.x, tile.y);
  }

  private countMonsterPopulation(presetKey: string): number {
    let count = 0;

    for (const monster of this.monsters.values()) {
      if (monster.presetKey === presetKey) {
        count += 1;
      }
    }

    return count;
  }

  private spawnPopulationMonster(
    preset: MonsterPopulationPreset,
    now = Date.now(),
  ): ChannelMonster | null {
    const position = this.getRandomWalkablePosition();

    if (!position) {
      return null;
    }

    const monster: ChannelMonster = {
      id: `monster:${now}:${Math.random().toString(36).slice(2, 8)}`,
      // 야생 몬스터는 머리 위 이름표를 노출하지 않는다. 식별은 presetKey로만 한다.
      name: '',
      renderId: preset.renderId,
      renderColor: preset.renderColor,
      x: position.x,
      y: position.y,
      direction: 'down',
      spawnedAt: new Date(now).toISOString(),
      expiresAt: ChannelService.PERSISTENT_MONSTER_EXPIRES_AT,
      presetKey: preset.name,
    };

    this.registerMonster(monster, now);
    return monster;
  }

  /**
   * 맵 전체에서 이동 가능한(이동불가 타일이 아닌) 임의의 위치를 찾는다.
   * 대부분의 타일이 이동 가능하므로 거부 샘플링으로 충분하며,
   * 극히 드문 실패 시에는 리스폰 중심 주변의 이동 가능 타일로 대체한다.
   */
  private getRandomWalkablePosition(): { x: number; y: number } | null {
    for (
      let attempt = 0;
      attempt < ChannelService.MONSTER_POPULATION_SPAWN_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const tileX = this.randomInt(0, this.maxTileX);
      const tileY = this.randomInt(0, this.maxTileY);

      if (this.isWalkDisabledTile(tileX, tileY)) {
        continue;
      }

      return this.toWorldPosition(tileX, tileY);
    }

    const fallbackTile = this.findNearbyWalkableTile(
      this.respawnCenterTileX,
      this.respawnCenterTileY,
      this.randomInt(0, 32),
    );

    return this.toWorldPosition(fallbackTile.x, fallbackTile.y);
  }

  private createMonster(
    position: { x: number; y: number },
    requestedName?: string,
    now = Date.now(),
  ) {
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

    this.registerMonster(monster, now);

    return monster;
  }

  private registerMonster(monster: ChannelMonster, now = Date.now()) {
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
      if (this.shouldRemovePopulationMonster(monster)) {
        this.detachMonster(monster.id);
        continue;
      }

      if (this.isPersistentMonster(monster)) {
        continue;
      }

      const expiresAt = new Date(monster.expiresAt).getTime();
      if (expiresAt <= now) {
        this.detachMonster(monster.id);
      }
    }
  }

  private isPersistentMonster(monster: ChannelMonster): boolean {
    return typeof monster.presetKey === 'string';
  }

  private shouldRemovePopulationMonster(monster: ChannelMonster): boolean {
    return (
      this.monsterPopulationPresets.length === 0 &&
      typeof monster.presetKey === 'string'
    );
  }

  private isMonsterSpawnOperator(participant: ChannelParticipant) {
    return participant.isGuest !== true && participant.isOperator === true;
  }

  private detachMonster(monsterId: string) {
    this.monsters.delete(monsterId);
    this.lastMonsterMovedAtById.delete(monsterId);
  }

  private tryRemoveMonsterHitByAttack(
    participant: ChannelParticipant,
    previousRenderState: ChannelRenderState | undefined,
    nextRenderState: ChannelRenderState,
  ) {
    const nextAttackSequence = nextRenderState.attackSequence ?? null;
    const previousAttackSequence = previousRenderState?.attackSequence ?? null;

    if (
      nextAttackSequence === null ||
      nextAttackSequence === previousAttackSequence
    ) {
      return null;
    }

    const attackExpiresAt = nextRenderState.attackExpiresAt
      ? new Date(nextRenderState.attackExpiresAt).getTime()
      : Number.NaN;
    if (!Number.isFinite(attackExpiresAt) || attackExpiresAt <= Date.now()) {
      return null;
    }

    const targetMonster = this.findMonsterHitByParticipant(participant);
    if (!targetMonster) {
      return null;
    }

    this.detachMonster(targetMonster.id);
    return targetMonster;
  }

  private findMonsterHitByParticipant(participant: ChannelParticipant) {
    let closestMonster: ChannelMonster | null = null;
    let closestForwardDistance = Number.POSITIVE_INFINITY;
    let closestLateralDistance = Number.POSITIVE_INFINITY;

    for (const monster of this.monsters.values()) {
      const candidate = this.getDirectionalAttackCandidate(
        participant.direction,
        participant.x,
        participant.y,
        monster.x,
        monster.y,
      );

      if (!candidate) {
        continue;
      }

      if (
        candidate.forwardDistance < closestForwardDistance ||
        (candidate.forwardDistance === closestForwardDistance &&
          candidate.lateralDistance < closestLateralDistance)
      ) {
        closestMonster = monster;
        closestForwardDistance = candidate.forwardDistance;
        closestLateralDistance = candidate.lateralDistance;
      }
    }

    return closestMonster;
  }

  private getDirectionalAttackCandidate(
    direction: ChannelDirection,
    attackerX: number,
    attackerY: number,
    targetX: number,
    targetY: number,
  ) {
    const deltaX = targetX - attackerX;
    const deltaY = targetY - attackerY;
    let forwardDistance = 0;
    let lateralDistance = 0;

    switch (direction) {
      case 'up':
        forwardDistance = -deltaY;
        lateralDistance = Math.abs(deltaX);
        break;
      case 'down':
        forwardDistance = deltaY;
        lateralDistance = Math.abs(deltaX);
        break;
      case 'left':
        forwardDistance = -deltaX;
        lateralDistance = Math.abs(deltaY);
        break;
      case 'right':
        forwardDistance = deltaX;
        lateralDistance = Math.abs(deltaY);
        break;
    }

    if (
      forwardDistance <= 0 ||
      forwardDistance > ChannelService.ATTACK_HIT_FORWARD_RANGE ||
      lateralDistance > ChannelService.ATTACK_HIT_LATERAL_RANGE
    ) {
      return null;
    }

    return { forwardDistance, lateralDistance };
  }

  private randomInt(min: number, max: number) {
    if (max <= min) {
      return min;
    }

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Fisher-Yates 셔플(균등 분포). 입력 배열을 제자리에서 섞고 그대로 반환한다. */
  private shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
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
    // Fisher-Yates 셔플로 방향 편향을 제거한다.
    // (sort(() => Math.random() - 0.5) 는 분포가 치우쳐 몬스터가 우측 상단으로 쏠린다.)
    const shuffled = this.shuffle([...candidates]);
    const fromTileX = monster.x / ChannelService.TILE_SIZE;
    const fromTileY = monster.y / ChannelService.TILE_SIZE;

    for (const candidate of shuffled) {
      // 맵 경계 밖이거나 no_move 칸, 또는 두 칸 사이 오브젝트 벽이 있으면 건너뛴다.
      // (clamp 로 제자리에 머무르게 하면 가장자리에서 이동을 낭비하게 된다.)
      if (!this.collision.canCross(fromTileX, fromTileY, candidate.direction)) {
        continue;
      }

      return {
        ...monster,
        x: monster.x + candidate.dx,
        y: monster.y + candidate.dy,
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

  /**
   * (fromX, fromY)에서 (dx, dy) 만큼 이동할 수 있는가.
   * 한 칸 직선 이동이면 방향 엣지(오브젝트 벽)까지 검사하고,
   * 그 외(대각선 등 비정형 입력)는 목적지 칸의 통행 가능 여부만 본다.
   */
  private canTraverse(
    fromX: number,
    fromY: number,
    dx: number,
    dy: number,
  ): boolean {
    const fromTile = this.toTilePosition(fromX, fromY);
    const isSingleAxisStep = (dx === 0) !== (dy === 0);

    if (fromTile && isSingleAxisStep) {
      const stepDirection: ChannelDirection =
        dx !== 0 ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      return this.collision.canCross(fromTile.x, fromTile.y, stepDirection);
    }

    // 대각선 등 비정형 입력은 목적지 칸 단위 통행 가능 여부만 본다(엣지 미적용).
    const toX = this.clamp(fromX + dx, 0, this.maxPositionX);
    const toY = this.clamp(fromY + dy, 0, this.maxPositionY);
    return this.isWalkablePosition(toX, toY);
  }

  private isWalkablePosition(x: number, y: number): boolean {
    const tilePosition = this.toTilePosition(x, y);

    if (!tilePosition) {
      return false;
    }

    return !this.isWalkDisabledTile(tilePosition.x, tilePosition.y);
  }

  private toTilePosition(x: number, y: number) {
    if (
      x % ChannelService.TILE_SIZE !== 0 ||
      y % ChannelService.TILE_SIZE !== 0
    ) {
      return null;
    }

    const tileX = x / ChannelService.TILE_SIZE;
    const tileY = y / ChannelService.TILE_SIZE;

    if (
      tileX < 0 ||
      tileX > this.maxTileX ||
      tileY < 0 ||
      tileY > this.maxTileY
    ) {
      return null;
    }

    return { x: tileX, y: tileY };
  }

  private isWalkDisabledTile(tileX: number, tileY: number) {
    return !this.collision.isWalkableTile(tileX, tileY);
  }

  private findNearbyWalkableTile(
    baseTileX: number,
    baseTileY: number,
    index: number,
    minDistance = 0,
  ) {
    const targetIndex = Math.max(index, 0);
    let walkableIndex = 0;

    for (
      let radius = 0;
      radius <= Math.max(this.mapTileWidth, this.mapTileHeight);
      radius += 1
    ) {
      for (
        let tileY = Math.max(baseTileY - radius, 0);
        tileY <= Math.min(baseTileY + radius, this.maxTileY);
        tileY += 1
      ) {
        for (
          let tileX = Math.max(baseTileX - radius, 0);
          tileX <= Math.min(baseTileX + radius, this.maxTileX);
          tileX += 1
        ) {
          const distance = Math.max(
            Math.abs(tileX - baseTileX),
            Math.abs(tileY - baseTileY),
          );

          if (distance !== radius || distance < minDistance) {
            continue;
          }

          if (this.isWalkDisabledTile(tileX, tileY)) {
            continue;
          }

          if (walkableIndex === targetIndex) {
            return { x: tileX, y: tileY };
          }

          walkableIndex += 1;
        }
      }
    }

    return {
      x: baseTileX,
      y: baseTileY,
    };
  }

  private toWorldPosition(tileX: number, tileY: number) {
    return {
      x: this.clamp(tileX * ChannelService.TILE_SIZE, 0, this.maxPositionX),
      y: this.clamp(tileY * ChannelService.TILE_SIZE, 0, this.maxPositionY),
    };
  }
}
