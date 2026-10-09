const { createRequire } = require('module');
const path = require('path');
const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const dotenv = appRequire('dotenv');
const { MongoClient } = appRequire('mongodb');

dotenv.config({ path: '.env' });

const names = [
  'items',
  'item_mixs',
  'monsters',
  'monster_maps',
  'skills',
  'skill_fomuls',
];

async function main() {
  const client = new MongoClient(
    process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/info?authSource=admin',
    process.env.MONGO_USERNAME
      ? { auth: { username: process.env.MONGO_USERNAME, password: process.env.MONGO_PASSWORD } }
      : {},
  );
  try {
    await client.connect();
    const db = client.db();
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    for (const name of names) {
      const count = existing.has(name) ? await db.collection(name).estimatedDocumentCount() : 0;
      process.stdout.write(`${name}: ${count}\n`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message.replace(/mongodb:\/\/[^@]+@/g, 'mongodb://[redacted]@')}`);
  process.exitCode = 1;
});
