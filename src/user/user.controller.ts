import {
  Controller,
  Get,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

const SEARCH_DISABLED_MESSAGE = 'user search features are disabled';

@Controller('users')
export class UserController {
  @Get('/')
  legacyUserSearch(@Res() res: Response) {
    this.sendGone(res);
  }

  @Get('/single')
  legacySingleUserSearch(@Res() res: Response) {
    this.sendGone(res);
  }

  @Get('/clan')
  legacyClanSearch(@Res() res: Response) {
    this.sendGone(res);
  }

  @Get('/search-ranking')
  legacySearchRanking(@Res() res: Response) {
    this.sendGone(res);
  }

  @Post('/:name/like')
  legacyCharacterLike(@Res() res: Response) {
    this.sendGone(res);
  }

  @Post('/userDatas')
  legacyUserDatas(@Res() res: Response) {
    this.sendGone(res);
  }

  @Post('/v2-userDatas')
  legacyV2UserDatas(@Res() res: Response) {
    this.sendGone(res);
  }

  private sendGone(res: Response) {
    res.status(HttpStatus.GONE).send({
      result: 'fail',
      message: SEARCH_DISABLED_MESSAGE,
    });
  }
}
