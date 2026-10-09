import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CampfireStore, CAMPFIRE_LIFETIME_MS } from './campfire-store';
import { ChannelService } from './channel.service';

describe('Campfire placement and lifetime', () => {
  it('blocks all four corners of the 9x9 area but permits the fifth tile', () => {
    const store = new CampfireStore();
    const now = Date.now();
    expect(store.place(240, 240, now).fire).toBeDefined();
    for (const dx of [-96, 0, 96]) for (const dy of [-96, 0, 96]) {
      expect(store.place(240 + dx, 240 + dy, now + 1).error).toBeDefined();
    }
    expect(store.place(360, 240, now + 1).fire).toBeDefined();
  });

  it('expires at exactly 30 minutes and then releases the occupied area', () => {
    const store = new CampfireStore();
    const now = Date.now();
    const fire = store.place(240, 240, now).fire!;
    expect(store.list(now + CAMPFIRE_LIFETIME_MS - 1)).toHaveLength(1);
    expect(store.expire(now + CAMPFIRE_LIFETIME_MS)).toEqual([fire]);
    expect(store.list(now + CAMPFIRE_LIFETIME_MS)).toHaveLength(0);
    expect(store.place(240, 240, now + CAMPFIRE_LIFETIME_MS).fire).toBeDefined();
  });

  it('restores unexpired fires after a server restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'baramvision-campfire-test-'));
    const filename = join(dir, 'world.json');
    try {
      const first = new CampfireStore(filename);
      const fire = first.place(240, 240).fire!;
      expect(new CampfireStore(filename).list()).toEqual([fire]);
      first.expire(Date.now() + CAMPFIRE_LIFETIME_MS);
      expect(new CampfireStore(filename).list()).toHaveLength(0);
    } finally {
      rmSync(filename, { force: true });
      rmdirSync(dir);
    }
  });

  it('rejects an unknown participant and shares a guest fire in bootstrap after disconnect', () => {
    const service = new ChannelService();
    expect(service.placeCampfire('missing').error).toBeDefined();
    service.addGuestParticipant('guest', '127.0.0.1');
    const result = service.placeCampfire('guest');
    expect(result.fire).toBeDefined();
    service.removeParticipant('guest');
    expect(service.getBootstrapPayload().campfires).toEqual([result.fire]);
  });
});
