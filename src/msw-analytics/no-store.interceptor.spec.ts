import { of } from 'rxjs';
import { NoStoreInterceptor } from './no-store.interceptor';

describe('NoStoreInterceptor', () => {
  it('키가 붙은 주소가 캐시·색인되지 않게 헤더를 세운다', () => {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
    };
    const next = { handle: jest.fn(() => of('ok')) };

    new NoStoreInterceptor().intercept(context as never, next as never);

    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, max-age=0',
    );
    expect(setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex, nofollow');
  });

  it('핸들러보다 먼저 세워 401·400 응답에도 남긴다', () => {
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
    };
    const next = { handle: jest.fn(() => of('ok')) };

    new NoStoreInterceptor().intercept(context as never, next as never);

    expect(setHeader.mock.invocationCallOrder[0]).toBeLessThan(
      next.handle.mock.invocationCallOrder[0],
    );
  });
});
