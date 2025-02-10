import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '안녕하세요 바람비전입니다.';
  }
}
