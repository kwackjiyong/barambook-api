import { Logger, Module, type Provider } from '@nestjs/common';
import { MemberModule } from '../member/member.module';
import { UserModule } from '../user/user.module';
import { ChannelGateway } from './channel.gateway';
import { ChannelService } from './channel.service';
import { ChannelWorldsService } from './channel-worlds.service';
import {
  CHANNEL_MAP_CONFIGS,
  DEFAULT_CHANNEL_KEY,
  buildFallbackCollision,
  loadMapCollision,
  type ChannelKey,
} from './map-collision';

const channelWorldsServiceProvider: Provider = {
  provide: ChannelWorldsService,
  useFactory: async () => {
    const logger = new Logger('ChannelCollision');
    const worlds = new Map<ChannelKey, ChannelService>();

    for (const config of CHANNEL_MAP_CONFIGS) {
      try {
        const collision = await loadMapCollision(config);
        logger.log(
          `Loaded ${config.channelLabel} ${config.cmpName} (${collision.width}x${collision.height}) ` +
            `no-move ${collision.noMoveCount}, object-edge ${collision.edgeCount}`,
        );
        worlds.set(config.channelKey, new ChannelService(config, collision));
      } catch (error) {
        if (config.channelKey !== DEFAULT_CHANNEL_KEY) {
          logger.error(
            `Failed to load required ${config.channelLabel} ${config.cmpName}: ${String(error)}`,
          );
          throw error;
        }

        logger.warn(
          `Failed to load ${config.channelLabel} ${config.cmpName}; using fallback collision: ${String(error)}`,
        );
        worlds.set(
          config.channelKey,
          new ChannelService(config, buildFallbackCollision(config)),
        );
      }
    }

    return new ChannelWorldsService(worlds);
  },
};

@Module({
  imports: [MemberModule, UserModule],
  providers: [ChannelGateway, channelWorldsServiceProvider],
})
export class ChannelModule {}
