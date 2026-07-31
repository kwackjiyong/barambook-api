import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { blockHotlink } from './referer.guard';

const contextWith = (headers: Record<string, string | undefined>) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('blockHotlink', () => {
  it('lets our own pages through', () => {
    expect(
      blockHotlink.canActivate(
        contextWith({ referer: 'https://barambook.com/old-render' }),
      ),
    ).toBe(true);
    expect(
      blockHotlink.canActivate(
        contextWith({ origin: 'https://www.barambook.com' }),
      ),
    ).toBe(true);
    expect(
      blockHotlink.canActivate(
        contextWith({ referer: 'http://localhost:3000/x' }),
      ),
    ).toBe(true);
  });

  it('treats subdomains as ours', () => {
    expect(
      blockHotlink.canActivate(
        contextWith({ origin: 'https://beta.barambook.com' }),
      ),
    ).toBe(true);
  });

  /*
   * 이미지 주소를 새 탭에서 바로 열거나, 메신저가 링크 미리보기를 가져갈 때는
   * 헤더가 붙지 않는다. 그걸 막으면 공유가 깨지므로 통과시킨다.
   * 헤더를 지우고 긁는 수집기는 속도 제한이 맡는다.
   */
  it('allows requests that carry no origin at all', () => {
    expect(blockHotlink.canActivate(contextWith({}))).toBe(true);
  });

  it('blocks another site embedding our images', () => {
    expect(() =>
      blockHotlink.canActivate(
        contextWith({ referer: 'https://copycat.example/page' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('is not fooled by a domain that merely ends with ours', () => {
    expect(() =>
      blockHotlink.canActivate(
        contextWith({ origin: 'https://notbarambook.com' }),
      ),
    ).toThrow(ForbiddenException);
  });
});
