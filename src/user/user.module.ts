import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CharacterVisibilitySchema } from '../member/character-visibility.schema';
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
      ],
      'barambook',
    ),
  ],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}
