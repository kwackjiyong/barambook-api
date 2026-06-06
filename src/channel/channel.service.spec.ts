import { ChannelService, type ChannelMonster } from './channel.service';
import { Member } from '../member/member.schema';

const TILE_SIZE = 24;

function getMonsters(service: ChannelService): ChannelMonster[] {
  return Array.from(
    (service as unknown as { monsters: Map<string, ChannelMonster> }).monsters.values(),
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
    service.addParticipant(createMember('tester', 'tester-character'), 'socket-1', 0);

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
      getNextMonsterPosition: (monster: ChannelMonster) => ChannelMonster | null;
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
