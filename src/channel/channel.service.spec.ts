import { ChannelService } from './channel.service';
import { Member } from '../member/member.schema';

describe('ChannelService monster spawn limit', () => {
  let service: ChannelService;

  beforeEach(() => {
    service = new ChannelService();
  });

  it('allows only one active monster per authenticated user', () => {
    service.addParticipant(createMember('tester'), 'socket-1', 0);

    const firstSpawn = service.spawnMonster('socket-1');
    const secondSpawn = service.spawnMonster('socket-1');

    expect(firstSpawn.monster).toBeDefined();
    expect(secondSpawn.monster).toBeUndefined();
    expect(secondSpawn.error).toBeDefined();
  });

  it('recharges summon availability after the user monster expires', () => {
    service.addParticipant(createMember('tester'), 'socket-1', 0);

    const firstSpawn = service.spawnMonster('socket-1');
    expect(firstSpawn.monster).toBeDefined();

    const expiresAt = new Date(firstSpawn.monster!.expiresAt).getTime();
    const removedMonsters = service.removeExpiredMonsters(expiresAt);
    const nextSpawn = service.spawnMonster('socket-1');

    expect(removedMonsters).toHaveLength(1);
    expect(removedMonsters[0]?.id).toBe(firstSpawn.monster!.id);
    expect(nextSpawn.error).toBeUndefined();
    expect(nextSpawn.monster).toBeDefined();
  });

  it('keeps the guest summon lock across reconnects from the same IP until the monster disappears', () => {
    service.addGuestParticipant('guest-socket-1', '127.0.0.1');

    const firstSpawn = service.spawnMonster('guest-socket-1');
    expect(firstSpawn.monster).toBeDefined();

    service.removeParticipant('guest-socket-1');
    service.addGuestParticipant('guest-socket-2', '127.0.0.1');

    const blockedSpawn = service.spawnMonster('guest-socket-2');
    expect(blockedSpawn.error).toBeDefined();

    service.removeMonster(firstSpawn.monster!.id);

    const nextSpawn = service.spawnMonster('guest-socket-2');
    expect(nextSpawn.error).toBeUndefined();
    expect(nextSpawn.monster).toBeDefined();
  });
});

function createMember(accountId: string) {
  return {
    accountId,
    passwordHash: 'hash',
    MSWID: `${accountId}-mswid`,
    verifiedAt: new Date(),
    representativeCharacterName: `${accountId}-character`,
  } as Member;
}
