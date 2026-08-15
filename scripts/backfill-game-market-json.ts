import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import {
  GameMarketChatInput,
  GameMarketService,
} from '../src/game-market/game-market.service';

interface ExportedChat {
  type: string;
  name: string;
  worldTagId: string;
  content: string;
  sourceMessageId: string;
  createdAt?: { $date?: string } | string;
}

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error(
    '사용법: ts-node scripts/backfill-game-market-json.ts <chat_messages.json>',
  );
}

function toInput(chat: ExportedChat): GameMarketChatInput {
  const createdAtValue =
    typeof chat.createdAt === 'string' ? chat.createdAt : chat.createdAt?.$date;
  return {
    type: chat.type,
    name: chat.name,
    worldTagId: chat.worldTagId,
    content: chat.content,
    sourceMessageId: chat.sourceMessageId,
    createdAt: createdAtValue ? new Date(createdAtValue) : undefined,
  };
}

async function main() {
  const chats = (
    JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as ExportedChat[]
  ).filter((chat) => chat.type === '사자후');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const market = app.get(GameMarketService);
  let processed = 0;
  let parsed = 0;
  try {
    for (let index = 0; index < chats.length; index += 250) {
      const result = await market.ingestChats(
        chats.slice(index, index + 250).map(toInput),
      );
      processed += result.processed;
      parsed += result.parsed;
      if (index % 5000 === 0 || index + 250 >= chats.length) {
        console.log(
          `${Math.min(index + 250, chats.length)}/${chats.length} 확인 · ${processed}건 처리 · ${parsed}개 호가`,
        );
      }
    }
  } finally {
    await Promise.race([
      app.close(),
      new Promise<void>((resolveClose) => setTimeout(resolveClose, 5000)),
    ]);
  }
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
