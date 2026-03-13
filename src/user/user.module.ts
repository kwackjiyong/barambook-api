import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterVisibilitySchema } from '../member/character-visibility.schema';
import { CharacterLikeSchema } from './character-like.schema';
import { UserController } from './user.controller';
import { UserSchema } from './user.schema';
import { UserService } from './user.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        { name: 'users', schema: UserSchema },
        {
          name: 'character_visibilities',
          schema: CharacterVisibilitySchema,
        },
        {
          name: 'character_likes',
          schema: CharacterLikeSchema,
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
