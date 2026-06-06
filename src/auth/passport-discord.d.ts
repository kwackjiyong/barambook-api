declare module 'passport-discord' {
  import { Strategy as PassportStrategy } from 'passport';

  export interface Profile {
    id: string;
    username: string;
    global_name?: string;
    discriminator: string;
    email?: string;
    verified?: boolean;
    [key: string]: unknown;
  }

  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
  }

  export type VerifyCallback = (err: unknown, user?: unknown) => void;

  export class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: VerifyCallback,
      ) => void,
    );
    name: string;
  }
}
