import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { ChatMessage } from './chat-feed.schema';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { QueryChatFeedDto } from './dto/query-chat-feed.dto';

const DEFAULT_PAGE_SIZE = 30;

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
    const filter: FilterQuery<ChatMessage> = {};
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    if (query.type) filter.type = query.type;
    if (query.name?.trim()) {
      filter.name = { $regex: escapeRegExp(query.name.trim()), $options: 'i' };
    }
    if (query.content?.trim()) {
      filter.content = {
        $regex: escapeRegExp(query.content.trim()),
        $options: 'i',
      };
    }
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt);
      const cursorId = new Types.ObjectId(cursor.id);
      filter.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursorId } },
      ];
    }

    const rows = await this.chatMessageModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);

    return {
      items: pageRows.map((row) => this.serialize(row)),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: String(last._id),
            })
          : null,
      hasMore,
    };
  }

  private serialize(message: ChatMessage) {
    return {
      id: String(message._id),
      type: message.type,
      name: message.name,
      worldTagId: message.worldTagId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
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
