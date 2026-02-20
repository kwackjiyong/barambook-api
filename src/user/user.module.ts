import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './user.schema';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'users', schema: UserSchema }],
      'barambook',
    ),
  ],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}
