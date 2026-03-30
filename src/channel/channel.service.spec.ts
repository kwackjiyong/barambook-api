import { ChannelService } from './channel.service';
import { Member } from '../member/member.schema';

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
  it('does not auto-spawn monsters', () => {
    const firstSpawnedAt = Date.UTC(2026, 0, 1, 0, 0, 0);

    expect(service.autoSpawnMonster(firstSpawnedAt)).toBeNull();
    expect(service.autoSpawnMonster(firstSpawnedAt + 5000)).toBeNull();
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
