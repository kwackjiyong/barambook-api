// gif.service.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
import GIFEncoder = require('gif-encoder-2');

import { PNG } from 'pngjs';

type MakeGifOptions = {
  delayMs?: number; // 프레임 간 딜레이 (기본 100ms = 0.1s)
  repeat?: number; // 0: 무한 반복, -1: 반복 없음
  dispose?: number; // 2: 이전 프레임 지우고 그리기
  quality?: number; // 1(최고) ~ 30(빠름) 정도, 기본 10
  optimized?: boolean; // true면 무채색 계열 깨질 수도
};

// pngjs가 반환한 객체가 우리가 기대하는 구조인지 안전하게 확인
function isDecodedPng(
  obj: unknown,
): obj is { width: number; height: number; data: Buffer } {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o['width'] === 'number' &&
    typeof o['height'] === 'number' &&
    Buffer.isBuffer(o['data'])
  );
}

export function GifService() {
  /**
   * @param framesPngBuffers  각 프레임 PNG Buffer 배열 (모두 동일한 w,h)
   * @returns 애니메이션 GIF Buffer
   */
  const makeGifFromPngBuffers = async (
    framesPngBuffers: Buffer[],
    opts: MakeGifOptions = {},
  ): Promise<Buffer> => {
    if (framesPngBuffers.length === 0) {
      throw new Error('framesPngBuffers is empty');
    }

    // 1) 첫 프레임에서 width/height 추출 (타입가드로 안전하게)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const firstDecoded = PNG.sync.read(framesPngBuffers[0]) as unknown;
    if (!isDecodedPng(firstDecoded)) {
      throw new Error('Failed to decode first PNG frame');
    }
    const { width, height } = firstDecoded;

    // 1-1) 모든 프레임 크기 검증(옵션)
    for (let i = 1; i < framesPngBuffers.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const decoded = PNG.sync.read(framesPngBuffers[i]) as unknown;
      if (!isDecodedPng(decoded)) {
        throw new Error(`Failed to decode PNG frame at index ${i}`);
      }
      if (decoded.width !== width || decoded.height !== height) {
        throw new Error(
          `Frame ${i} size mismatch: got ${decoded.width}x${decoded.height}, expected ${width}x${height}`,
        );
      }
    }

    // 2) GIF 인코더 설정
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const encoder = new GIFEncoder(width, height, 'octree', opts.optimized); // useOptimized=true
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    encoder.start();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    encoder.setRepeat(opts.repeat ?? 0); // 0: 무한 반복
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    encoder.setDelay(opts.delayMs ?? 200); // 프레임 간격
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    encoder.setDispose(opts.dispose ?? 2); // 이전 프레임 처리 방식 1 or 2
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    encoder.setQuality(opts.quality ?? 1); // 속도/품질 트레이드오프

    // 3) 스트림으로 결과 받기
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const stream = encoder.createReadStream();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    stream.on('data', (c: Buffer) => {
      chunks.push(c);
    });

    // 4) 각 PNG → RGBA 추출 후 addFrame (타입가드로 안전 접근)
    for (let i = 0; i < framesPngBuffers.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const decoded = PNG.sync.read(framesPngBuffers[i]) as unknown;
      if (!isDecodedPng(decoded)) {
        throw new Error(`Failed to decode PNG frame at index ${i}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      encoder.setTransparent(0x000000);
      // gif-encoder-2는 Uint8Array/Uint8ClampedArray RGBA를 받음
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      encoder.addFrame(new Uint8Array(decoded.data));
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    encoder.finish();

    // 5) 완료 대기 후 Buffer 병합
    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      stream.on('end', () => resolve());
    });
    return Buffer.concat(chunks);
  };
  return {
    makeGifFromPngBuffers,
  };
}
