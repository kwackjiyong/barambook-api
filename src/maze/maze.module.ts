import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MazeController } from './maze.controller';
import { MazeMapSchema } from './maze.schema';
import { MazeService } from './maze.service';

@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: 'maze_maps', schema: MazeMapSchema }],
      'barambook',
    ),
  ],
  controllers: [MazeController],
  providers: [MazeService],
  exports: [MazeService],
})
export class MazeModule {}
