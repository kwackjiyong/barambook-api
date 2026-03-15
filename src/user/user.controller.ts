/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { UserService } from './user.service';
import { User } from './user.schema';

const UPSERT_SECRET =
  '5fa092bc12fb7c75200b7dd18526c7af9f664e49accdb8a51a377695f165f6736fc62402ff89a227fdff9fd4b0c07fb78a8a559356afda9f06b1c89005a2d4717e114d9bdb7daa1a837e9e29dbb6fb342819694bc90775512fb357471c59c388f87acde1d6823862ee678822bf89ed5619a11a7b421f4d0adf8b6b20f13f7534';

@Controller('users')
export class UserController {
  constructor(private readonly svc: UserService) {}

  @Get('/')
  async getUserData(@Query('name') name: string, @Req() req: Request) {
    const users = await this.svc.findUserByName(name, this.extractRequestIp(req));

    return users?.map((user) => {
      return {
        name: user.Name,
        clan: user.ClanName,
        class: user.Class,
        nation: user.Nation,
        level: user.Level,
        grade: user.Grade,
        hp: user.MaxHP,
        mp: user.MaxMP,
        likeCount: user.likeCount,
        isHidden: user.isHidden,
      };
    });
  }

  @Get('/single')
  async getSingleUserData(@Query('name') name: string, @Req() req: Request) {
    const user = await this.svc.findSingleUserByName(name, this.extractRequestIp(req));

    return {
      name: user.Name,
      clan: user.ClanName,
      class: user.Class,
      nation: user.Nation,
      level: user.Level,
      grade: user.Grade,
      hp: user.MaxHP,
      mp: user.MaxMP,
      likeCount: user.likeCount,
      isHidden: user.isHidden,
    };
  }

  @Get('/clan')
  async getUsersByClan(@Query('name') name: string) {
    const users = await this.svc.findUsersByClanName(name);

    return users.map((user) => ({
      name: user.Name,
      clan: user.ClanName,
      class: user.Class,
      nation: user.Nation,
      level: user.Level,
      grade: user.Grade,
      hp: user.MaxHP,
      mp: user.MaxMP,
      likeCount: user.likeCount,
      isHidden: user.isHidden,
    }));
  }

  @Get('/search-ranking')
  async getSearchRanking() {
    return this.svc.getSearchRanking(5);
  }

  @Post('/:name/like')
  async likeCharacter(@Param('name') name: string, @Req() req: Request) {
    return this.svc.addCharacterLike(name, this.extractRequestIp(req));
  }

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

  private extractRequestIp(req: Request) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const firstForwardedIp =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]
        : Array.isArray(forwardedFor)
          ? forwardedFor[0]
          : null;
    const rawIp = (firstForwardedIp ?? req.ip ?? req.socket.remoteAddress ?? '').trim();
    return rawIp.replace(/^::ffff:/, '') || 'unknown';
  }
}
