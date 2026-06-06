import { Logger, Module, type Provider } from '@nestjs/common';
import { MemberModule } from '../member/member.module';
import { UserModule } from '../user/user.module';
import { ChannelGateway } from './channel.gateway';
import { ChannelService } from './channel.service';
import {
  BUYEO_MAP_CONFIG,
  buildFallbackCollision,
  loadMapCollision,
} from './map-collision';

/**
 * 채널 충돌 정보를 CDN 의 `.cmp`(+ TILE.DAT/SObj.tbl)에서 부팅 시 비동기로 로딩해
 * ChannelService 에 주입한다. 로딩 실패 시 부여성(330)의 동기 폴백으로 안전하게 시작한다.
 */
const channelServiceProvider: Provider = {
  provide: ChannelService,
  useFactory: async () => {
    const logger = new Logger('ChannelCollision');
    const config = BUYEO_MAP_CONFIG;

    try {
      const collision = await loadMapCollision(config);
      logger.log(
        `Loaded ${config.cmpName} (${collision.width}x${collision.height}) — ` +
          `no-move ${collision.noMoveCount}, object-edge ${collision.edgeCount}`,
      );
      return new ChannelService(config, collision);
    } catch (error) {
      logger.warn(
        `Failed to load ${config.cmpName}; using built-in fallback collision: ${String(error)}`,
      );
      return new ChannelService(config, buildFallbackCollision(config));
    }
  },
};

@Module({
  imports: [MemberModule, UserModule],
  providers: [ChannelGateway, channelServiceProvider],
})
export class ChannelModule {}
