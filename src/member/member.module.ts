import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from '../user/user.schema';
import {
  CharacterVisibilitySchema,
} from './character-visibility.schema';
import { MemberController } from './member.controller';
import { MemberSchema } from './member.schema';
import { MemberSessionGuard } from './member-session.guard';
import { MemberService } from './member.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'members', schema: MemberSchema },
        { name: 'users', schema: UserSchema },
        {
          name: 'character_visibilities',
          schema: CharacterVisibilitySchema,
        },
      ],
      'barambook',
    ),
  ],
  controllers: [MemberController],
  providers: [MemberService, MemberSessionGuard],
  exports: [MemberService],
})
export class MemberModule {}
