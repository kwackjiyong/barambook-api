import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { MonsterModule } from './guide/monster/monster.module';
import { SkillModule } from './guide/skill/skill.module';
import { ItemModule } from './guide/item/item.module';
import { RenderModule } from './render/render.module';
import { MapModule } from './map/map.module';
import * as dotenv from 'dotenv';

dotenv.config();

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URL ??
        'mongodb://localhost:27017/info?authSource=admin',
      {
        connectionName: process.env.MONGO_CONNECTIONNAME,
        auth: {
          username: process.env.MONGO_USERNAME,
          password: process.env.MONGO_PASSWORD,
        },
      },
    ),
    MonsterModule,
    SkillModule,
    ItemModule,
    RenderModule,
    MapModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
