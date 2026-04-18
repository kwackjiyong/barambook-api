import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterLikeSchema } from './character-like.schema';
import { UserController } from './user.controller';
import { UserSchema } from './user.schema';
import { UserService } from './user.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [
        {
          name: 'character_likes',
          schema: CharacterLikeSchema,
        },
        {
          name: 'users',
          schema: UserSchema,
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
