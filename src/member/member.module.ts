import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MemberSchema } from './member.schema';
import { MemberSessionGuard } from './member-session.guard';
import { MemberService } from './member.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'sso_members', schema: MemberSchema }],
      'barambook',
    ),
  ],
  providers: [MemberService, MemberSessionGuard],
  exports: [MemberService, MemberSessionGuard],
})
export class MemberModule {}
