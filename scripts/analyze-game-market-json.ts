import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MarketCatalogItem,
  parseMarketMessage,
} from '../src/game-market/game-market.parser';

interface ItemFile {
  equip?: MarketCatalogItem[];
  etc?: MarketCatalogItem[];
  costume?: MarketCatalogItem[];
}

interface ChatFileEntry {
  type: string;
  content: string;
}

const chatPath = process.argv[2];
const itemPath = process.argv[3];

if (!chatPath || !itemPath) {
  throw new Error(
    '사용법: ts-node scripts/analyze-game-market-json.ts <chat.json> <item.json>',
  );
}

const itemFile = JSON.parse(
  readFileSync(resolve(itemPath), 'utf8'),
) as ItemFile;
const catalog = [
  ...(itemFile.equip ?? []),
  ...(itemFile.costume ?? []),
  ...(itemFile.etc ?? []),
].filter((item) => item.name);
const chats = JSON.parse(
  readFileSync(resolve(chatPath), 'utf8'),
) as ChatFileEntry[];
const uniqueShouts = [
  ...new Set(
    chats
      .filter((chat) => chat.type === '사자후')
      .map((chat) => chat.content.trim()),
  ),
];

let quoteCount = 0;
let parsedMessages = 0;
const itemCounts = new Map<string, number>();
const examples: Array<{
  content: string;
  parsed: ReturnType<typeof parseMarketMessage>;
}> = [];

for (const content of uniqueShouts) {
  const parsed = parseMarketMessage(content, catalog);
  if (!parsed.length) continue;
  parsedMessages += 1;
  quoteCount += parsed.length;
  for (const quote of parsed) {
    itemCounts.set(quote.itemName, (itemCounts.get(quote.itemName) ?? 0) + 1);
  }
  if (examples.length < 25) examples.push({ content, parsed });
}

console.log(
  JSON.stringify(
    {
      catalogItems: catalog.length,
      uniqueShouts: uniqueShouts.length,
      parsedMessages,
      parsedMessageRate: Number(
        ((parsedMessages / Math.max(1, uniqueShouts.length)) * 100).toFixed(2),
      ),
      quoteCount,
      topItems: [...itemCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([itemName, count]) => ({ itemName, count })),
      examples,
    },
    null,
    2,
  ),
);
