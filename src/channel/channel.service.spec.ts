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
