import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { SsoProfile } from '../../member/member.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'GOOGLE_CLIENT_ID_NOT_SET',
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET || 'GOOGLE_CLIENT_SECRET_NOT_SET',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3010/auth/google/callback',
      scope: ['profile', 'email'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const user: SsoProfile = {
      provider: 'google',
      providerId: profile.id,
      nickname: profile.displayName || profile.username || '바람비전 유저',
      email: profile.emails?.[0]?.value,
    };

    done(null, user);
  }
}
