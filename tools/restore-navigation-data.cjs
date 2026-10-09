const { createRequire } = require('module');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
const dotenv = appRequire('dotenv');
const { BSON, MongoClient } = appRequire('mongodb');
const { EJSON } = BSON;

dotenv.config({ path: '.env' });

const collections = ['map_code_names', 'map_portals', 'world_maps'];

const [mode, folder] = process.argv.slice(2);
if (!['export', 'import'].includes(mode) || !folder) {
  console.error('Usage: node tools/restore-navigation-data.cjs export|import FOLDER');
  process.exit(2);
}

const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');

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
    if (mode === 'export') {
      fs.mkdirSync(folder, { recursive: true });
      const manifest = { collections: {} };
      for (const name of collections) {
        const documents = await db.collection(name).find({}).toArray();
        if (documents.length === 0) throw new Error(`${name} is empty in the source DB`);
        const content = EJSON.stringify(documents, { relaxed: false });
        fs.writeFileSync(path.join(folder, `${name}.json`), content, { flag: 'wx' });
        manifest.collections[name] = { count: documents.length, sha256: hash(content) };
        console.log(`${name}: ${documents.length}`);
      }
      fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), {
        flag: 'wx',
      });
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
    if (Object.keys(manifest.collections).sort().join(',') !== [...collections].sort().join(',')) {
      throw new Error('Manifest collection list does not match the approved scope');
    }
    const batches = new Map();
    for (const name of collections) {
      const content = fs.readFileSync(path.join(folder, `${name}.json`), 'utf8');
      const documents = EJSON.parse(content, { relaxed: false });
      if (hash(content) !== manifest.collections[name].sha256 ||
          !Array.isArray(documents) || documents.length !== manifest.collections[name].count) {
        throw new Error(`${name} failed integrity validation`);
      }
      const targetCount = await db.collection(name).estimatedDocumentCount();
      if (targetCount !== 0) throw new Error(`${name} target is not empty: ${targetCount}`);
      batches.set(name, documents);
    }
    for (const [name, documents] of batches) {
      await db.collection(name).insertMany(documents, { ordered: true });
      const count = await db.collection(name).estimatedDocumentCount();
      if (count !== documents.length) throw new Error(`${name} count mismatch after import`);
      console.log(`${name}: ${count}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message.replace(/mongodb:\/\/[^@]+@/g, 'mongodb://[redacted]@')}`);
  process.exitCode = 1;
});

