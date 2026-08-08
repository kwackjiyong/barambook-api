import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ChatFeedService } from './chat-feed.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { QueryChatFeedDto } from './dto/query-chat-feed.dto';

// barambook-chat-scan 기본 내장 키. 운영에서는 CHAT_SCAN_API_KEY로 교체할 수 있다.
const DEFAULT_CHAT_SCAN_API_KEY =
  'bbcs_6f52a8ce1c7292e11647e7cc5a43f1959bd90473a862cbc9c04f6a8581dd0345';

function secretsMatch(actual: string | undefined, expected: string) {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

@Controller('chat-feed')
export class ChatFeedController {
  constructor(private readonly chatFeedService: ChatFeedService) {}

  @Get()
  findPage(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    query: QueryChatFeedDto,
  ) {
    return this.chatFeedService.findPage(query);
  }

  @Post()
  create(
    @Headers('x-chat-scan-key') apiKey: string | undefined,
    @Headers('x-chat-message-id') sourceMessageId: string | undefined,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: CreateChatMessageDto,
  ) {
    const expectedKey =
      process.env.CHAT_SCAN_API_KEY ?? DEFAULT_CHAT_SCAN_API_KEY;
    if (!secretsMatch(apiKey, expectedKey)) {
      throw new UnauthorizedException('invalid chat scan key');
    }
    const messageId = sourceMessageId?.trim();
    if (!messageId || messageId.length > 160) {
      throw new BadRequestException('invalid chat message id');
    }
    return this.chatFeedService.create(body, messageId);
  }
}
