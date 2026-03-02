import { Module } from '@nestjs/common';
import { MemberModule } from '../member/member.module';
import { ChannelGateway } from './channel.gateway';
import { ChannelService } from './channel.service';

@Module({
  imports: [MemberModule],
  providers: [ChannelGateway, ChannelService],
})
export class ChannelModule {}
