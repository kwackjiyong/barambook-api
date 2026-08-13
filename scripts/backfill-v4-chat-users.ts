import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

config();

const mongoUrl =
  process.env.MONGO_URL ?? 'mongodb://localhost:27017/info?authSource=admin';
const username = process.env.MONGO_USERNAME;
const password = process.env.MONGO_PASSWORD;

async function run() {
  const client = new MongoClient(mongoUrl, {
    ...(username && password ? { auth: { username, password } } : {}),
  });

  try {
    await client.connect();
    const database = client.db();
    const chatUsers = database.collection('v4_chat_users');

    await database
      .collection('chat_messages')
      .aggregate(
        [
          {
            $match: {
              name: { $type: 'string' },
              worldTagId: { $type: 'string' },
            },
          },
          { $sort: { createdAt: 1 } },
          {
            $group: {
              _id: '$name',
              worldTagId: { $last: { $toLower: '$worldTagId' } },
              createdAt: { $first: '$createdAt' },
              updatedAt: { $last: '$createdAt' },
            },
          },
          { $match: { worldTagId: { $regex: '^[a-z0-9]{5}$' } } },
          {
            $project: {
              _id: 1,
              name: '$_id',
              worldTagId: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
          {
            $merge: {
              into: 'v4_chat_users',
              on: '_id',
              whenMatched: [
                {
                  $set: {
                    name: '$$new.name',
                    worldTagId: {
                      $cond: [
                        { $gte: ['$$new.updatedAt', '$updatedAt'] },
                        '$$new.worldTagId',
                        '$worldTagId',
                      ],
                    },
                    createdAt: { $ifNull: ['$createdAt', '$$new.createdAt'] },
                    updatedAt: {
                      $cond: [
                        { $gte: ['$$new.updatedAt', '$updatedAt'] },
                        '$$new.updatedAt',
                        '$updatedAt',
                      ],
                    },
                  },
                },
              ],
              whenNotMatched: 'insert',
            },
          },
        ],
        { allowDiskUse: true },
      )
      .toArray();

    await Promise.all([
      chatUsers.createIndex({ name: 1 }, { unique: true }),
      chatUsers.createIndex({ worldTagId: 1 }),
    ]);

    const count = await chatUsers.countDocuments();
    console.log(`v4_chat_users backfill complete: ${count} characters`);
  } finally {
    await client.close();
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
