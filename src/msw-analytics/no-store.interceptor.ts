import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';

// 조회 주소에는 ?key= 가 붙을 수 있으므로 응답이 캐시되거나 색인되지 않게 한다.
// 프런트 미들웨어에서 붙이면 /data/* 리라이트가 업스트림 응답을 그대로 내보내 헤더가 남지 않는다.
// 인터셉터의 전처리는 파이프와 핸들러보다 먼저 돌므로 401·400 응답에도 헤더가 붙는다.
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return next.handle();
  }
}
