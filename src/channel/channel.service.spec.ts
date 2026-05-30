import { ChannelService, type ChannelMonster } from './channel.service';
import { Member } from '../member/member.schema';
import { disabledPositions } from '../assets/object/330_disabled_xy';

const TILE_SIZE = 24;
const WALK_DISABLED_TILE_SET = new Set(
  disabledPositions.map((position) => `${position.x}:${position.y}`),
);
const MONSTER_POPULATION_PRESETS = (
  ChannelService as unknown as {
    MONSTER_POPULATION_PRESETS: Array<{
      name: string;
      renderId: number;
      renderColor: number;
      count: number;
    }>;
  }
).MONSTER_POPULATION_PRESETS;

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

function fillMonsterPopulation(service: ChannelService) {
  let now = Date.UTC(2026, 0, 1, 0, 0, 0);

  // 배치 단위로 나눠 스폰되므로 충분히 여러 주기를 진행시켜 개체수를 채운다.
  for (let tick = 0; tick < 80; tick += 1) {
    service.maintainMonsterPopulation(now);
    now += 600;
  }

  return now;
}

describe('ChannelService monster spawn limit', () => {
  let service: ChannelService;

  beforeEach(() => {
    service = new ChannelService();
  });

  it('allows the 바람비전 operator to spawn up to the shared 120 monster limit', () => {
    service.addParticipant(
      createMember('tester', '\uBC14\uB78C\uBE44\uC804'),
      'socket-1',
      0,
    );

    const spawned = Array.from({ length: 120 }, () =>
      service.spawnMonster('socket-1'),
    );
    const overflowSpawn = service.spawnMonster('socket-1');

    expect(spawned.every((result) => result.monster)).toBe(true);
    expect(overflowSpawn.monster).toBeUndefined();
    expect(overflowSpawn.error).toBe('최대 120마리까지만 소환가능합니다.');
  });

  it('blocks non-operator members from spawning monsters', () => {
    service.addParticipant(createMember('tester', 'tester-character'), 'socket-1', 0);

    const result = service.spawnMonster('socket-1');

    expect(result.monster).toBeUndefined();
    expect(result.error).toBe(
      '몬스터 소환은 닉네임 "바람비전" 운영자만 사용할 수 있습니다.',
    );
  });

  it('blocks guests from spawning monsters', () => {
    service.addGuestParticipant('guest-socket-1', '127.0.0.1');

    const result = service.spawnMonster('guest-socket-1');

    expect(result.monster).toBeUndefined();
    expect(result.error).toBe(
      '몬스터 소환은 닉네임 "바람비전" 운영자만 사용할 수 있습니다.',
    );
  });
  it('auto-maintains the configured wild monster population on walkable tiles', () => {
    fillMonsterPopulation(service);

    const wildMonsters = getWildMonsters(service);
    const expectedTotal = MONSTER_POPULATION_PRESETS.reduce(
      (sum, preset) => sum + preset.count,
      0,
    );

    expect(wildMonsters.length).toBe(expectedTotal);

    for (const preset of MONSTER_POPULATION_PRESETS) {
      const sameKind = wildMonsters.filter(
        (monster) => monster.presetKey === preset.name,
      );

      expect(sameKind.length).toBe(preset.count);

      for (const monster of sameKind) {
        expect(monster.renderId).toBe(preset.renderId);
        expect(monster.renderColor).toBe(preset.renderColor);
        // 야생 몬스터는 머리 위 이름표가 노출되지 않도록 이름이 비어 있어야 한다.
        expect(monster.name).toBe('');
        // 이동불가 타일이 아닌, 타일에 정렬된 좌표에만 스폰되어야 한다.
        expect(monster.x % TILE_SIZE).toBe(0);
        expect(monster.y % TILE_SIZE).toBe(0);
        expect(
          WALK_DISABLED_TILE_SET.has(
            `${monster.x / TILE_SIZE}:${monster.y / TILE_SIZE}`,
          ),
        ).toBe(false);
      }
    }
  });

  it('does not exceed the configured count even after repeated maintenance ticks', () => {
    const lastNow = fillMonsterPopulation(service);

    // 이미 가득 찬 상태에서 더 진행시켜도 개체수가 늘어나지 않아야 한다.
    service.maintainMonsterPopulation(lastNow + 600);

    for (const preset of MONSTER_POPULATION_PRESETS) {
      const sameKind = getWildMonsters(service).filter(
        (monster) => monster.presetKey === preset.name,
      );
      expect(sameKind.length).toBe(preset.count);
    }
  });

  it('keeps wild monsters alive through expiry sweeps and refills them after a kill', () => {
    fillMonsterPopulation(service);

    // 만료 스윕(영구 만료 시각 이후)에도 야생 몬스터는 제거되지 않는다.
    const removed = service.removeExpiredMonsters(Date.UTC(2100, 0, 1));
    expect(removed.every((monster) => monster.presetKey === undefined)).toBe(
      true,
    );

    const rabbitPreset = MONSTER_POPULATION_PRESETS.find(
      (preset) => preset.name === '토끼',
    )!;
    const rabbits = getWildMonsters(service).filter(
      (monster) => monster.presetKey === rabbitPreset.name,
    );
    expect(rabbits.length).toBe(rabbitPreset.count);

    // 한 마리를 잡으면 부족분이 다음 주기에 다시 채워진다.
    service.removeMonster(rabbits[0].id);
    expect(
      getWildMonsters(service).filter(
        (monster) => monster.presetKey === rabbitPreset.name,
      ).length,
    ).toBe(rabbitPreset.count - 1);

    let now = Date.UTC(2026, 1, 1, 0, 0, 0);
    for (let tick = 0; tick < 10; tick += 1) {
      service.maintainMonsterPopulation(now);
      now += 600;
    }

    expect(
      getWildMonsters(service).filter(
        (monster) => monster.presetKey === rabbitPreset.name,
      ).length,
    ).toBe(rabbitPreset.count);
  });

  it('moves monsters without directional bias (no top-right drift)', () => {
    const internals = service as unknown as {
      getRandomWalkablePosition: () => { x: number; y: number } | null;
      getNextMonsterPosition: (monster: ChannelMonster) => ChannelMonster | null;
    };

    const SAMPLE = 600;
    const STEPS = 250;
    let sumTileX = 0;
    let sumTileY = 0;

    for (let n = 0; n < SAMPLE; n += 1) {
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

      for (let step = 0; step < STEPS; step += 1) {
        const next = internals.getNextMonsterPosition(monster);
        if (next) {
          monster = next;
        }
      }

      sumTileX += monster.x / TILE_SIZE;
      sumTileY += monster.y / TILE_SIZE;
    }

    const centroidTileX = sumTileX / SAMPLE;
    const centroidTileY = sumTileY / SAMPLE;

    // 편향이 없으면 무리의 무게중심이 맵 중심(약 72, 82) 부근에 머문다.
    // 우측 상단 쏠림이면 X가 크게 증가하고 Y가 크게 감소한다(편향 시 약 93, 41).
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
      x: 70 * 24,
      y: 122 * 24,
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
    const hitMonster = {
      id: 'monster-hit',
      name: 'monster-hit',
      renderId: 1,
      renderColor: 0,
      x: 70 * 24,
      y: 123 * 24,
      direction: 'down',
      spawnedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    const farMonster = {
      ...hitMonster,
      id: 'monster-far',
      y: 125 * 24,
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
      x: 70 * 24,
      y: 122 * 24,
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

function createMember(accountId: string, representativeCharacterName?: string) {
  return {
    accountId,
    passwordHash: 'hash',
    MSWID: `${accountId}-mswid`,
    verifiedAt: new Date(),
    representativeCharacterName:
      representativeCharacterName ?? `${accountId}-character`,
  } as Member;
}
