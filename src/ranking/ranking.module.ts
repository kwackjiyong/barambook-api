import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RankingController } from './ranking.controller';
import { UserV3Schema } from './ranking.schema';
import { RankingService } from './ranking.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'user_v3', schema: UserV3Schema }],
      'barambook',
    ),
  ],
  controllers: [RankingController],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
