/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { UserService } from './user.service';
import { User } from './user.schema';

@Controller('users')
export class UserController {
  constructor(private readonly svc: UserService) {}

  // @Get('/')
  // async getUserData(@Query('instanceId') mswInstatnceId: string) {
  //   return await this.svc.findUser(mswInstatnceId);
  // }

  @Post('/userDatas')
  async userDatas(
    @Body('userDatas') userDatas: Array<User>,
    @Res() res: Response,
  ) {
    await this.svc.upsertUsers(userDatas);
    res.send({ result: 'ok' });
  }
}
