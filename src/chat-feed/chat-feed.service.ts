import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { ChatMessage } from './chat-feed.schema';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { QueryChatFeedDto } from './dto/query-chat-feed.dto';

const DEFAULT_PAGE_SIZE = 30;
// 실시간 폴링 한 번에 돌려줄 최대 건수. 이 한도를 넘으면 목록에 구멍이 생기므로 gap으로 알린다.
const LIVE_PAGE_SIZE = 50;
// 이름/내용 검색에 기간이 지정되지 않았을 때 강제로 적용하는 조회 창.
const SEARCH_WINDOW_DAYS = 30;
// 정규식 필터가 DB를 붙잡고 있지 못하도록 거는 상한.
const QUERY_TIME_LIMIT_MS = 5000;
const MAX_TIME_MS_EXPIRED = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO_OBJECT_ID = '000000000000000000000000';

interface FeedCursor {
  createdAt: string;
  id: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class ChatFeedService {
  constructor(
    @InjectModel('chat_messages', 'barambook')
    private readonly chatMessageModel: Model<ChatMessage>,
  ) {}

  async create(dto: CreateChatMessageDto, sourceMessageId: string) {
    const normalized = {
      type: dto.type,
      name: dto.name.trim(),
      worldTagId: dto.worldTagId.trim(),
      content: dto.content.trim(),
      sourceMessageId,
    };

    try {
      const created = await this.chatMessageModel.create(normalized);
      return { created: true, item: this.serialize(created) };
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      const existing = await this.chatMessageModel
        .findOne({ sourceMessageId })
        .exec();
      return {
        created: false,
        item: existing ? this.serialize(existing) : null,
      };
    }
  }

  async findPage(query: QueryChatFeedDto) {
    if (query.cursor && query.since) {
      throw new BadRequestException('cursor와 since는 함께 쓸 수 없습니다.');
    }

    const filter: FilterQuery<ChatMessage> = {};
    if (query.type) filter.type = query.type;

    const name = query.name?.trim();
    const content = query.content?.trim();
    if (name) filter.name = { $regex: escapeRegExp(name), $options: 'i' };
    if (content) {
      filter.content = { $regex: escapeRegExp(content), $options: 'i' };
    }

    // 대소문자 무시 정규식은 인덱스를 타지 못해, 조건에 맞는 채팅이 드물면
    // createdAt 인덱스를 처음부터 끝까지 훑게 된다(200만 건 기준 약 7초).
    // 검색이 걸린 요청은 조회 창을 강제로 좁혀 스캔 범위를 유한하게 묶는다.
    const to = query.to ? new Date(query.to) : null;
    let from = query.from ? new Date(query.from) : null;
    let clampedFrom: Date | null = null;
    if ((name || content) && !from) {
      const anchor = to ?? new Date();
      from = new Date(anchor.getTime() - SEARCH_WINDOW_DAYS * DAY_MS);
      clampedFrom = from;
    }
    if (from || to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (from) range.$gte = from;
      if (to) range.$lte = to;
      filter.createdAt = range;
    }

    const searchWindow = clampedFrom
      ? { from: clampedFrom.toISOString(), days: SEARCH_WINDOW_DAYS }
      : null;

    if (query.since) return this.findNewer(filter, query.since, searchWindow);
    return this.findOlder(filter, query, searchWindow);
  }

  /** 실시간 폴링. since보다 새로운 채팅만 조회하므로 스캔 범위가 폴링 간격만큼으로 묶인다. */
  private async findNewer(
    filter: FilterQuery<ChatMessage>,
    since: string,
    searchWindow: { from: string; days: number } | null,
  ) {
    const cursor = this.decodeCursor(since);
    const at = new Date(cursor.createdAt);
    const id = new Types.ObjectId(cursor.id);
    filter.$or = [
      { createdAt: { $gt: at } },
      { createdAt: at, _id: { $gt: id } },
    ];

    const rows = await this.run(filter, LIVE_PAGE_SIZE + 1);
    const gap = rows.length > LIVE_PAGE_SIZE;
    const items = (gap ? rows.slice(0, LIVE_PAGE_SIZE) : rows).map((row) =>
      this.serialize(row),
    );

    return {
      items,
      nextCursor: gap ? (items.at(-1)?.cursor ?? null) : null,
      hasMore: gap,
      // 조회된 게 없으면 클라이언트가 기준점을 그대로 유지하도록 되돌려준다.
      latestCursor: items[0]?.cursor ?? since,
      // 한도를 넘겨 잘렸으면 기존 목록과 사이가 비므로 클라이언트가 목록을 갈아끼워야 한다.
      gap,
      searchWindow,
    };
  }

  /** 최초 조회와 과거 방향 페이징. */
  private async findOlder(
    filter: FilterQuery<ChatMessage>,
    query: QueryChatFeedDto,
    searchWindow: { from: string; days: number } | null,
  ) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      const at = new Date(cursor.createdAt);
      const id = new Types.ObjectId(cursor.id);
      filter.$or = [
        { createdAt: { $lt: at } },
        { createdAt: at, _id: { $lt: id } },
      ];
    }

    const rows = await this.run(filter, limit + 1);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row) =>
      this.serialize(row),
    );

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.cursor ?? null) : null,
      hasMore,
      // 과거 페이지를 받아오는 중에는 폴링 기준점을 건드리지 않는다.
      // 첫 조회에서 결과가 비었으면 현재 시각을 기준점으로 삼는다.
      latestCursor: query.cursor
        ? null
        : (items[0]?.cursor ??
          this.encodeCursor({
            createdAt: new Date().toISOString(),
            id: ZERO_OBJECT_ID,
          })),
      gap: false,
      searchWindow,
    };
  }

  private async run(filter: FilterQuery<ChatMessage>, limit: number) {
    try {
      return await this.chatMessageModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .maxTimeMS(QUERY_TIME_LIMIT_MS)
        .exec();
    } catch (error) {
      if ((error as { code?: number })?.code === MAX_TIME_MS_EXPIRED) {
        throw new RequestTimeoutException(
          '검색 범위가 너무 넓습니다. 기간을 좁혀 다시 시도해 주세요.',
        );
      }
      throw error;
    }
  }

  private serialize(message: ChatMessage) {
    const createdAt = message.createdAt.toISOString();
    const id = String(message._id);
    return {
      id,
      type: message.type,
      name: message.name,
      worldTagId: message.worldTagId,
      content: message.content,
      createdAt,
      // 목록을 잘라낼 때 클라이언트가 다음 커서를 바로 집어낼 수 있도록 항목마다 실어 보낸다.
      cursor: this.encodeCursor({ createdAt, id }),
    };
  }

  private encodeCursor(cursor: FeedCursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): FeedCursor {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as FeedCursor;
      if (
        !parsed?.createdAt ||
        Number.isNaN(new Date(parsed.createdAt).getTime()) ||
        !Types.ObjectId.isValid(parsed.id)
      ) {
        throw new Error('invalid cursor');
      }
      return parsed;
    } catch {
      throw new BadRequestException('invalid cursor');
    }
  }
}
