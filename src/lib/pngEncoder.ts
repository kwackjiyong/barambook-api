import { PNG } from 'pngjs';

type RGBA = { r: number; g: number; b: number; a: number };

// pngjs 디코딩 결과 타입 가드
function isDecodedPng(
  obj: unknown,
): obj is { width: number; height: number; data: Buffer } {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    Buffer.isBuffer(o.data)
  );
}

/**
 * PNG 버퍼에서 알파가 0(또는 cutoff 이하)인 픽셀을 지정한 RGBA로 채워서
 * 다시 PNG 버퍼로 반환합니다.
 *
 * @param pngBuffer  원본 PNG Buffer
 * @param fill       채울 색 (기본: rgba(1,1,1,255))
 * @param alphaCutoff 이 값 이하의 알파를 "투명"으로 간주 (기본 0)
 */
export function fillTransparentInPngBuffer(
  pngBuffer: Buffer,
  fill: RGBA = { r: 1, g: 1, b: 1, a: 0 },
  alphaCutoff = 254,
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const decoded = PNG.sync.read(pngBuffer) as unknown;
  if (!isDecodedPng(decoded)) {
    throw new Error('Failed to decode PNG');
  }

  const data = decoded.data; // Buffer (RGBA, length = w*h*4)

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a <= alphaCutoff) {
      data[i] = fill.r; // R
      data[i + 1] = fill.g; // G
      data[i + 2] = fill.b; // B
      data[i + 3] = fill.a; // A (보통 255)
    }
  }

  // in-place로 data를 바꿨으니 그대로 다시 PNG로 인코드
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return PNG.sync.write(decoded);
}
