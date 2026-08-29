import { createConnection } from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const username = process.env.MONGO_USERNAME;
  const password = process.env.MONGO_PASSWORD;
  const connection = await createConnection(
    process.env.MONGO_URL ?? 'mongodb://localhost:27017/info?authSource=admin',
    username && password ? { auth: { username, password } } : {},
  ).asPromise();

  try {
    const collection = connection.collection('old_baram_items');
    const result = await collection.updateMany(
      { $or: [{ hpRegen: { $exists: true } }, { mpRegen: { $exists: true } }] },
      { $rename: { hpRegen: 'maxHpPercent', mpRegen: 'maxMpPercent' } },
    );
    console.log(
      `${result.modifiedCount}개 아이템의 체력·마력 상승률 필드를 이전했습니다.`,
    );

    const samples = await collection
      .find(
        { name: { $in: ['승리의증표', '진월신검'] } },
        {
          projection: {
            _id: 0,
            name: 1,
            maxHpPercent: 1,
            maxMpPercent: 1,
            hpRegen: 1,
            mpRegen: 1,
          },
        },
      )
      .toArray();
    console.log(JSON.stringify(samples, null, 2));
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
