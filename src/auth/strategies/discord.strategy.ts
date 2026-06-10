import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-discord';
import { SsoProfile } from '../../member/member.service';

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, 'discord') {
  constructor() {
    super({
      clientID: process.env.DISCORD_CLIENT_ID || 'DISCORD_CLIENT_ID_NOT_SET',
      clientSecret:
        process.env.DISCORD_CLIENT_SECRET || 'DISCORD_CLIENT_SECRET_NOT_SET',
      callbackURL:
        process.env.DISCORD_CALLBACK_URL ||
        'http://localhost:3010/auth/discord/callback',
      scope: ['identify', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const user: SsoProfile = {
      provider: 'discord',
      providerId: profile.id,
      nickname: profile.global_name || profile.username || '바람비전 유저',
      email: profile.email,
      discordId: profile.username,
    };

    done(null, user);
  }
}
