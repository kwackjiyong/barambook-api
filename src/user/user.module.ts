import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterLikeSchema } from './character-like.schema';
import { CharacterSearchSchema } from './character-search.schema';
import { UserController } from './user.controller';
import { UserSchema } from './user.schema';
import { UserService } from './user.service';
import { V2UserSchema } from './v2-user.schema';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'users', schema: UserSchema },
        { name: 'v2_users', schema: V2UserSchema },
        {
          name: 'character_likes',
          schema: CharacterLikeSchema,
        },
        {
          name: 'character_searches',
          schema: CharacterSearchSchema,
        },
      ],
      'barambook',
    ),
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
