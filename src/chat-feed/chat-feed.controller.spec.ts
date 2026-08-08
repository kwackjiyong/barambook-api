import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ChatFeedController } from './chat-feed.controller';
import { ChatFeedService } from './chat-feed.service';

const API_KEY =
  'bbcs_6f52a8ce1c7292e11647e7cc5a43f1959bd90473a862cbc9c04f6a8581dd0345';

describe('ChatFeedController', () => {
  const service = {
    create: jest.fn(),
    findPage: jest.fn(),
  };
  const controller = new ChatFeedController(
    service as unknown as ChatFeedService,
  );
  const body = {
    type: '방송쿠폰' as const,
    name: '산타별',
    worldTagId: 'DVaAB',
    content: '#  240녹한방',
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid scanner key', () => {
    expect(() => controller.create('wrong', 'message-1', body)).toThrow(
      UnauthorizedException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('requires an idempotency message id', () => {
    expect(() => controller.create(API_KEY, undefined, body)).toThrow(
      BadRequestException,
    );
  });

  it('accepts the scanner payload and forwards its message id', () => {
    service.create.mockReturnValue({ created: true });
    controller.create(API_KEY, 'message-1', body);
    expect(service.create).toHaveBeenCalledWith(body, 'message-1');
  });
});
