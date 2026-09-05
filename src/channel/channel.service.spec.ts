import { ChannelService, type ChannelMonster } from './channel.service';
import { Member } from '../member/member.schema';
import {
  DALMAJI_MAP_CONFIG,
  RACCOON_VILLAGE_MAP_CONFIG,
  buildFallbackCollision,
} from './map-collision';

const TILE_SIZE = 24;

function getMonsters(service: ChannelService): ChannelMonster[] {
  return Array.from(
    (
      service as unknown as { monsters: Map<string, ChannelMonster> }
    ).monsters.values(),
  );
}

function getWildMonsters(service: ChannelService): ChannelMonster[] {
  return getMonsters(service).filter(
    (monster) => typeof monster.presetKey === 'string',
  );
}

function runMonsterPopulationTicks(service: ChannelService) {
  let now = Date.UTC(2026, 0, 1, 0, 0, 0);

  for (let tick = 0; tick < 80; tick += 1) {
    service.maintainMonsterPopulation(now);
    now += 600;
  }

  return now;
}

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(() => {
    service = new ChannelService();
  });

  it('disables manual monster spawning for operators', () => {
    service.addParticipant(
      createMember('tester', 'tester-character', true),
      'socket-1',
      0,
    );

    const result = service.spawnMonster('socket-1');

    expect(result.monster).toBeUndefined();
    expect(result.error).toBe('몬스터 소환 기능은 현재 비활성화되어 있습니다.');
  });

  it('blocks non-operator members from spawning monsters', () => {
    service.addParticipant(
      createMember('tester', 'tester-character'),
      'socket-1',
      0,
    );

    const result = service.spawnMonster('socket-1');

    expect(result.monster).toBeUndefined();
    expect(result.error).toBe('몬스터 소환은 운영자만 사용할 수 있습니다.');
  });

  it('blocks guests from spawning monsters', () => {
    service.addGuestParticipant('guest-socket-1', '127.0.0.1');

    const result = service.spawnMonster('guest-socket-1');

    expect(result.monster).toBeUndefined();
    expect(result.error).toBe('몬스터 소환은 운영자만 사용할 수 있습니다.');
  });

  it('does not auto-maintain a wild monster population', () => {
    runMonsterPopulationTicks(service);

    expect(getWildMonsters(service)).toHaveLength(0);
  });

  it('keeps wild monster population disabled after repeated maintenance ticks', () => {
    const lastNow = runMonsterPopulationTicks(service);

    service.maintainMonsterPopulation(lastNow + 600);

    expect(getWildMonsters(service)).toHaveLength(0);
  });

  it('does not maintain butterflies in Dalmaji Pass', () => {
    const dalmajiService = new ChannelService(
      DALMAJI_MAP_CONFIG,
      buildFallbackCollision(DALMAJI_MAP_CONFIG),
    );

    runMonsterPopulationTicks(dalmajiService);

    expect(getWildMonsters(dalmajiService)).toHaveLength(0);
  });

  it('maintains 10 rabbits and 10 squirrels in Raccoon Village and refills removed ones', () => {
    const raccoonVillageService = new ChannelService(
      RACCOON_VILLAGE_MAP_CONFIG,
      buildFallbackCollision(RACCOON_VILLAGE_MAP_CONFIG),
    );
    const lastNow = runMonsterPopulationTicks(raccoonVillageService);
    const wildMonsters = getWildMonsters(raccoonVillageService);
    const rabbits = wildMonsters.filter(
      (monster) => monster.presetKey === '토끼',
    );
    const squirrels = wildMonsters.filter(
      (monster) => monster.presetKey === '다람쥐',
    );

    expect(wildMonsters).toHaveLength(20);
    expect(rabbits).toHaveLength(10);
    expect(squirrels).toHaveLength(10);
    expect(rabbits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          renderId: 21,
          renderColor: 11,
        }),
      ]),
    );
    expect(squirrels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          renderId: 25,
          renderColor: 5,
        }),
      ]),
    );

    raccoonVillageService.removeMonster(rabbits[0].id);
    raccoonVillageService.removeMonster(squirrels[0].id);
    expect(getWildMonsters(raccoonVillageService)).toHaveLength(18);

    raccoonVillageService.maintainMonsterPopulation(lastNow + 600);

    const refilledMonsters = getWildMonsters(raccoonVillageService);
    expect(
      refilledMonsters.filter((monster) => monster.presetKey === '토끼'),
    ).toHaveLength(10);
    expect(
      refilledMonsters.filter((monster) => monster.presetKey === '다람쥐'),
    ).toHaveLength(10);
  });

  it('removes stale wild monsters when population is disabled', () => {
    const staleMonster: ChannelMonster = {
      id: 'stale-wild-monster',
      name: '',
      renderId: 21,
      renderColor: 11,
      x: 70 * TILE_SIZE,
      y: 122 * TILE_SIZE,
      direction: 'down',
      spawnedAt: new Date().toISOString(),
      expiresAt: '2099-12-31T23:59:59.999Z',
      presetKey: '토끼',
    };

    (service as any).monsters.set(staleMonster.id, staleMonster);

    const removed = service.removeExpiredMonsters();

    expect(removed).toContainEqual(staleMonster);
    expect(getWildMonsters(service)).toHaveLength(0);
  });

  it('moves monsters without directional bias (no top-right drift)', () => {
    const internals = service as unknown as {
      getRandomWalkablePosition: () => { x: number; y: number } | null;
      getNextMonsterPosition: (
        monster: ChannelMonster,
      ) => ChannelMonster | null;
    };

    const sample = 600;
    const steps = 250;
    let sumTileX = 0;
    let sumTileY = 0;

    for (let n = 0; n < sample; n += 1) {
      const start = internals.getRandomWalkablePosition()!;
      let monster: ChannelMonster = {
        id: `walker-${n}`,
        name: '',
        renderId: 1,
        renderColor: 0,
        x: start.x,
        y: start.y,
        direction: 'down',
        spawnedAt: '',
        expiresAt: '',
      };

      for (let step = 0; step < steps; step += 1) {
        const next = internals.getNextMonsterPosition(monster);
        if (next) {
          monster = next;
        }
      }

      sumTileX += monster.x / TILE_SIZE;
      sumTileY += monster.y / TILE_SIZE;
    }

    const centroidTileX = sumTileX / sample;
    const centroidTileY = sumTileY / sample;

    expect(centroidTileX).toBeGreaterThan(58);
    expect(centroidTileX).toBeLessThan(88);
    expect(centroidTileY).toBeGreaterThan(62);
    expect(centroidTileY).toBeLessThan(102);
  });

  it('removes the nearest monster when a participant attack sequence advances', () => {
    const participant = {
      id: 'socket-1',
      accountId: 'tester',
      displayName: 'tester-character',
      likeCount: 0,
      isGuest: false,
      x: 70 * TILE_SIZE,
      y: 122 * TILE_SIZE,
      direction: 'down',
      connectedAt: new Date().toISOString(),
      renderState: {
        head: 0,
        headc: 0,
        body: 0,
        bodyc: 0,
        weapon: 0,
        weaponc: 0,
        shield: 0,
        shieldc: 0,
        attackSequence: 0,
        attackExpiresAt: null,
      },
    } as any;
    const hitMonster: ChannelMonster = {
      id: 'monster-hit',
      name: 'monster-hit',
      renderId: 1,
      renderColor: 0,
      x: 70 * TILE_SIZE,
      y: 123 * TILE_SIZE,
      direction: 'down',
      spawnedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    const farMonster: ChannelMonster = {
      ...hitMonster,
      id: 'monster-far',
      y: 125 * TILE_SIZE,
    };

    (service as any).participants.set(participant.id, participant);
    (service as any).monsters.set(hitMonster.id, hitMonster);
    (service as any).monsters.set(farMonster.id, farMonster);

    const result = service.updateParticipantRender(participant.id, {
      ...participant.renderState,
      attackSequence: 1,
      attackExpiresAt: new Date(Date.now() + 500).toISOString(),
    });

    expect(result.participant).toBeDefined();
    expect(result.removedMonster?.id).toBe(hitMonster.id);
    expect((service as any).monsters.has(hitMonster.id)).toBe(false);
    expect((service as any).monsters.has(farMonster.id)).toBe(true);
  });

  it('stores jump state on participant movement updates', () => {
    const participant = {
      id: 'socket-1',
      accountId: 'tester',
      displayName: 'tester-character',
      likeCount: 0,
      isGuest: false,
      x: 70 * TILE_SIZE,
      y: 122 * TILE_SIZE,
      direction: 'down',
      connectedAt: new Date().toISOString(),
    } as any;

    (service as any).participants.set(participant.id, participant);

    const jumped = service.moveParticipant(participant.id, {
      dx: 0,
      dy: 0,
      direction: 'down',
      isJumping: true,
    });
    const grounded = service.moveParticipant(participant.id, {
      dx: 0,
      dy: 0,
      direction: 'down',
      isJumping: false,
    });

    expect(jumped?.isJumping).toBe(true);
    expect(jumped?.x).toBe(participant.x);
    expect(jumped?.y).toBe(participant.y);
    expect(grounded?.isJumping).toBe(false);
  });

  it('ignores direction changes until the current tile movement finishes', () => {
    const participant = {
      id: 'socket-1',
      accountId: 'tester',
      displayName: 'tester-character',
      likeCount: 0,
      isGuest: false,
      x: 70 * TILE_SIZE,
      y: 122 * TILE_SIZE,
      direction: 'right',
      connectedAt: new Date().toISOString(),
    } as any;

    (service as any).participants.set(participant.id, participant);
    (service as any).lastMovedAt.set(participant.id, Date.now());

    const turned = service.moveParticipant(participant.id, {
      dx: 0,
      dy: -TILE_SIZE,
      direction: 'up',
    });

    expect(turned).toBeNull();
    expect((service as any).participants.get(participant.id)).toMatchObject({
      x: participant.x,
      y: participant.y,
      direction: 'right',
    });
  });

  it('updates jump state during movement without changing direction', () => {
    const participant = {
      id: 'socket-1',
      accountId: 'tester',
      displayName: 'tester-character',
      likeCount: 0,
      isGuest: false,
      x: 70 * TILE_SIZE,
      y: 122 * TILE_SIZE,
      direction: 'right',
      connectedAt: new Date().toISOString(),
    } as any;

    (service as any).participants.set(participant.id, participant);
    (service as any).lastMovedAt.set(participant.id, Date.now());

    const jumped = service.moveParticipant(participant.id, {
      dx: 0,
      dy: -TILE_SIZE,
      direction: 'up',
      isJumping: true,
    });

    expect(jumped).toMatchObject({
      x: participant.x,
      y: participant.y,
      direction: 'right',
      isJumping: true,
    });
  });

  it('keeps riding direction locked for the full tile animation', () => {
    const participant = {
      id: 'socket-1',
      accountId: 'tester',
      displayName: 'tester-character',
      likeCount: 0,
      isGuest: false,
      x: 70 * TILE_SIZE,
      y: 122 * TILE_SIZE,
      direction: 'right',
      connectedAt: new Date().toISOString(),
    } as any;

    (service as any).participants.set(participant.id, participant);
    (service as any).lastMovedAt.set(participant.id, Date.now() - 150);

    const turned = service.moveParticipant(participant.id, {
      dx: 0,
      dy: -TILE_SIZE,
      direction: 'up',
      isRiding: true,
    });

    expect(turned).toBeNull();
    expect((service as any).participants.get(participant.id).direction).toBe(
      'right',
    );
  });

  it('marks participants as AFK after the idle threshold and wakes them on activity', () => {
    service.addGuestParticipant('guest-socket-1', '127.0.0.1');

    const notYetIdle = service.markIdleParticipantsAsAfk(
      Date.now() + 59 * 60 * 1000,
    );
    expect(notYetIdle).toHaveLength(0);

    const marked = service.markIdleParticipantsAsAfk(
      Date.now() + 61 * 60 * 1000,
    );
    expect(marked).toHaveLength(1);
    expect(marked[0]?.isAfk).toBe(true);

    // 이미 잠수인 참가자는 다시 반환하지 않는다.
    expect(
      service.markIdleParticipantsAsAfk(Date.now() + 62 * 60 * 1000),
    ).toHaveLength(0);

    const awakened = service.touchActivity('guest-socket-1');
    expect(awakened?.isAfk).toBe(false);

    // 잠수가 아닌 참가자의 활동은 브로드캐스트 대상이 아니므로 null을 반환한다.
    expect(service.touchActivity('guest-socket-1')).toBeNull();
  });

  it('keeps lobby-chat-only presence independent from AFK activity', () => {
    const participant = service.addGuestParticipant(
      'guest-lobby-socket',
      '127.0.0.2',
      true,
    );

    expect(participant.isLobbyChatOnly).toBe(true);
    expect(participant.isAfk).not.toBe(true);

    const [marked] = service.markIdleParticipantsAsAfk(
      Date.now() + 61 * 60 * 1000,
    );
    expect(marked?.isLobbyChatOnly).toBe(true);
    expect(marked?.isAfk).toBe(true);

    const awakened = service.touchActivity('guest-lobby-socket');
    expect(awakened?.isLobbyChatOnly).toBe(true);
    expect(awakened?.isAfk).toBe(false);
  });

  describe('training dummy', () => {
    const getParticipant = (socketId: string) =>
      service
        .getBootstrapPayload(socketId)
        .participants.find((participant) => participant.id === socketId)!;

    it('spawns one dummy in front of the summoner and replaces the previous one', () => {
      service.addParticipant(createMember('owner'), 'socket-owner', 0);
      const participant = getParticipant('socket-owner');

      const first = service.spawnTrainingDummy('socket-owner', {
        maxHp: 5000,
        ac: -20,
      });
      expect(first.error).toBeUndefined();
      expect(first.dummy?.kind).toBe('dummy');
      expect(first.dummy?.ownerId).toBe('socket-owner');
      expect(first.dummy?.hp).toBe(5000);
      expect(first.dummy?.maxHp).toBe(5000);
      expect(first.dummy?.ac).toBe(-20);
      // 참가자와 다른 칸(앞 칸 또는 그 주변)에 놓인다.
      expect(
        Math.max(
          Math.abs((first.dummy?.x ?? 0) - participant.x),
          Math.abs((first.dummy?.y ?? 0) - participant.y),
        ),
      ).toBeGreaterThanOrEqual(TILE_SIZE);

      const second = service.spawnTrainingDummy('socket-owner', {
        name: '해적오두목',
        renderId: 300,
        renderColor: 2,
      });
      expect(second.replaced?.id).toBe(first.dummy?.id);
      expect(second.dummy?.maxHp).toBe(100_000_000);
      expect(second.dummy?.name).toBe('해적오두목');
      expect(second.dummy?.renderId).toBe(300);
      expect(second.dummy?.renderColor).toBe(2);
      // 범위 밖 렌더 id는 목각인형으로 돌아간다.
      const third = service.spawnTrainingDummy('socket-owner', {
        renderId: 9999,
      });
      expect(third.dummy?.renderId).toBe(192);
      expect(third.dummy?.name).toBe('허수아비');
      expect(
        getMonsters(service).filter((m) => m.kind === 'dummy'),
      ).toHaveLength(1);
    });

    it('takes damage from anyone nearby, survives normal attacks, and falls at 0 HP', () => {
      service.addParticipant(createMember('owner'), 'socket-owner', 0);
      service.addParticipant(createMember('other'), 'socket-other', 0);
      const dummy = service.spawnTrainingDummy('socket-owner', {
        maxHp: 100,
      }).dummy!;

      // 일반 평타 판정(render-sync)으로는 사라지지 않는다.
      const owner = getParticipant('socket-owner');
      const renderState = {
        ...(owner.renderState ?? {
          head: 0,
          headc: 0,
          body: 0,
          bodyc: 0,
          weapon: 0,
          weaponc: 0,
          shield: 0,
          shieldc: 0,
        }),
        attackSequence: 1,
        attackExpiresAt: new Date(Date.now() + 1000).toISOString(),
      };
      expect(
        service.updateParticipantRender('socket-owner', renderState)
          .removedMonster,
      ).toBeUndefined();
      expect(getMonsters(service).some((m) => m.id === dummy.id)).toBe(true);

      // 다른 참가자는 아무 데나 접속하므로 허수아비 옆으로 옮겨 놓고 때린다.
      const participants = (
        service as unknown as {
          participants: Map<string, { x: number; y: number }>;
        }
      ).participants;
      const other = participants.get('socket-other')!;
      other.x = dummy.x + TILE_SIZE;
      other.y = dummy.y;

      const now = Date.now();
      const first = service.damageTrainingDummy(
        'socket-other',
        { dummyId: dummy.id, damage: 30, kind: 'melee' },
        now,
      );
      expect(first.error).toBeUndefined();
      expect(first.hit?.hp).toBe(70);
      expect(first.hit?.attackerId).toBe('socket-other');
      expect(first.killed).toBeUndefined();

      // 너무 빠른 연타는 무시한다.
      const tooFast = service.damageTrainingDummy(
        'socket-other',
        { dummyId: dummy.id, damage: 30, kind: 'melee' },
        now + 10,
      );
      expect(tooFast.hit).toBeUndefined();

      const miss = service.damageTrainingDummy(
        'socket-owner',
        { dummyId: dummy.id, damage: 999, isMiss: true, kind: 'melee' },
        now + 500,
      );
      expect(miss.hit?.damage).toBe(0);
      expect(miss.hit?.hp).toBe(70);

      const killing = service.damageTrainingDummy(
        'socket-other',
        { dummyId: dummy.id, damage: 1000, isCritical: true, kind: 'spell' },
        now + 1000,
      );
      expect(killing.hit?.hp).toBe(0);
      expect(killing.hit?.isCritical).toBe(true);
      expect(killing.killed?.id).toBe(dummy.id);
      expect(getMonsters(service).some((m) => m.id === dummy.id)).toBe(false);
    });

    it('rejects melee hits from far away and removes the dummy when the owner leaves', () => {
      service.addParticipant(createMember('owner'), 'socket-owner', 0);
      const dummy = service.spawnTrainingDummy('socket-owner').dummy!;

      // 소환자를 멀리 옮긴다(맵 반대편으로 순간이동시키는 대신 좌표를 직접 바꾼다).
      const participants = (
        service as unknown as {
          participants: Map<string, { x: number; y: number }>;
        }
      ).participants;
      const owner = participants.get('socket-owner')!;
      owner.x = dummy.x + TILE_SIZE * 5;
      owner.y = dummy.y;

      const far = service.damageTrainingDummy('socket-owner', {
        dummyId: dummy.id,
        damage: 10,
        kind: 'melee',
      });
      expect(far.error).toBeDefined();

      const spell = service.damageTrainingDummy('socket-owner', {
        dummyId: dummy.id,
        damage: 10,
        kind: 'spell',
      });
      expect(spell.hit?.hp).toBe(dummy.maxHp! - 10);

      const removed = service.removeTrainingDummiesOwnedBy('socket-owner');
      expect(removed.map((m) => m.id)).toEqual([dummy.id]);
      expect(getMonsters(service)).toHaveLength(0);
    });
  });

  it('clears activity tracking when a participant is removed', () => {
    service.addGuestParticipant('guest-socket-1', '127.0.0.1');
    service.removeParticipant('guest-socket-1');

    expect(service.getParticipantSocketIds()).toHaveLength(0);
    expect(
      service.markIdleParticipantsAsAfk(Date.now() + 61 * 60 * 1000),
    ).toHaveLength(0);
    expect(service.touchActivity('guest-socket-1')).toBeNull();
  });
});

function createMember(
  accountId: string,
  representativeCharacterName?: string,
  isOperator = false,
) {
  return {
    accountId,
    passwordHash: 'hash',
    MSWID: `${accountId}-mswid`,
    verifiedAt: new Date(),
    isOperator,
    representativeCharacterName:
      representativeCharacterName ?? `${accountId}-character`,
  } as Member;
}
