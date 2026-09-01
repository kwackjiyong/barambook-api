import { Controller, Get } from '@nestjs/common';
import { MazeService } from './maze.service';

@Controller('maze')
export class MazeController {
  constructor(private readonly service: MazeService) {}

  @Get('current')
  getCurrent() {
    return this.service.getCurrent();
  }
}
