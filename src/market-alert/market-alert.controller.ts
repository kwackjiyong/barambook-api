import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { MemberSessionGuard } from '../member/member-session.guard';
import { Member } from '../member/member.schema';
import {
  CreateMarketAlertRuleDto,
  UpdateMarketAlertRuleDto,
} from './dto/market-alert-rule.dto';
import { MarketAlertService } from './market-alert.service';

type AuthenticatedRequest = Request & {
  member?: Member;
};

const bodyValidation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

// 조건은 계정에 묶이므로 전 구간 로그인이 필요하다.
@Controller('market-alert')
@UseGuards(MemberSessionGuard)
export class MarketAlertController {
  constructor(private readonly marketAlertService: MarketAlertService) {}

  @Get('/rules')
  listRules(@Req() req: AuthenticatedRequest) {
    const member = req.member as Member;
    return this.marketAlertService.listRules(member.accountId);
  }

  @Post('/rules')
  @HttpCode(HttpStatus.OK)
  createRule(
    @Req() req: AuthenticatedRequest,
    @Body(bodyValidation) dto: CreateMarketAlertRuleDto,
  ) {
    const member = req.member as Member;
    return this.marketAlertService.createRule(member.accountId, dto);
  }

  @Patch('/rules/:id')
  updateRule(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(bodyValidation) dto: UpdateMarketAlertRuleDto,
  ) {
    const member = req.member as Member;
    return this.marketAlertService.updateRule(member.accountId, id, dto);
  }

  @Delete('/rules/:id')
  deleteRule(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const member = req.member as Member;
    return this.marketAlertService.deleteRule(member.accountId, id);
  }
}
