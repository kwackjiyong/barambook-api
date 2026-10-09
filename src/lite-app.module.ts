import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import * as dotenv from 'dotenv';
import { ItemModule } from './guide/item/item.module';
import { MonsterModule } from './guide/monster/monster.module';
import { SkillModule } from './guide/skill/skill.module';
import { ChannelModule } from './channel/channel.module';
import { MapModule } from './map/map.module';
import { RankingModule } from './ranking/ranking.module';

dotenv.config();

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URL ??
        'mongodb://localhost:27017/info?authSource=admin',
      {
        connectionName: process.env.MONGO_CONNECTIONNAME ?? 'barambook',
        auth: process.env.MONGO_USERNAME
          ? {
              username: process.env.MONGO_USERNAME,
              password: process.env.MONGO_PASSWORD,
            }
          : undefined,
      },
    ),
    ItemModule,
    MonsterModule,
    SkillModule,
    ChannelModule,
    MapModule,
    RankingModule,
  ],
})
export class LiteAppModule {}
