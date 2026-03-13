import { Module } from '@nestjs/common';
import { MemberModule } from '../member/member.module';
import { UserModule } from '../user/user.module';
import { ChannelGateway } from './channel.gateway';
import { ChannelService } from './channel.service';

@Module({
  imports: [MemberModule, UserModule],
  providers: [ChannelGateway, ChannelService],
})
export class ChannelModule {}
