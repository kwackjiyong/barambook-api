import { ChannelService } from './channel.service';
import type { ChannelKey } from './map-collision';

export class ChannelWorldsService {
  constructor(
    private readonly worlds: ReadonlyMap<ChannelKey, ChannelService>,
  ) {}

  get(channelKey: ChannelKey): ChannelService {
    const service = this.worlds.get(channelKey);

    if (!service) {
      throw new Error(`Channel world is not configured: ${channelKey}`);
    }

    return service;
  }

  entries(): Array<[ChannelKey, ChannelService]> {
    return Array.from(this.worlds.entries());
  }
}
