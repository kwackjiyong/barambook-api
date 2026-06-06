import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MemberModule } from '../member/member.module';
import { AuthController } from './auth.controller';
import { DiscordStrategy } from './strategies/discord.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [PassportModule, MemberModule],
  controllers: [AuthController],
  providers: [GoogleStrategy, DiscordStrategy],
})
export class AuthModule {}
