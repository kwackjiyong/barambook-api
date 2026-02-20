/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { UserService } from './user.service';
import { User } from './user.schema';

const UPSERT_SECRET =
  '5fa092bc12fb7c75200b7dd18526c7af9f664e49accdb8a51a377695f165f6736fc62402ff89a227fdff9fd4b0c07fb78a8a559356afda9f06b1c89005a2d4717e114d9bdb7daa1a837e9e29dbb6fb342819694bc90775512fb357471c59c388f87acde1d6823862ee678822bf89ed5619a11a7b421f4d0adf8b6b20f13f7534';

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
    @Body('secret') secret: string,
    @Res() res: Response,
  ) {
    if (secret === UPSERT_SECRET) {
      await this.svc.upsertUsers(userDatas);
      res.send({ result: 'ok' });
    } else {
      res.send({ result: 'fail' });
    }
  }
}
