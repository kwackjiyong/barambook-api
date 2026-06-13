import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RendererModule } from '../renderer/renderer.module';
import { MemberController } from './member.controller';
import { MemberSchema } from './member.schema';
import { MemberSessionGuard } from './member-session.guard';
import { MemberService } from './member.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'sso_members', schema: MemberSchema }],
      'barambook',
    ),
    // 대표 캐릭터 이미지 응답(GET /member/:accountId/character)에 사용
    RendererModule,
  ],
  controllers: [MemberController],
  providers: [MemberService, MemberSessionGuard],
  exports: [MemberService, MemberSessionGuard],
})
export class MemberModule {}
