import { PNG } from 'pngjs';
import * as zlib from 'zlib';
// npm i buffer-crc32
// eslint-disable-next-line @typescript-eslint/no-require-imports
import crc32 = require('buffer-crc32');

type APNGFrame = {
  png: Buffer;
  delayNum?: number; // 분자
  delayDen?: number; // 분모
  disposeOp?: number;
  blendOp?: number;
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); // \x89PNG\r\n\x1a\n

function makeChunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');

  const crc = crc32(Buffer.concat([t, data]));
  return Buffer.concat([len, t, data, crc]);
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function makeAPNGBase64(
  frames: APNGFrame[],
  { loopCount = 0 }: { loopCount?: number } = {},
): Promise<Buffer> {
  if (!frames.length) throw new Error('no frames');

  // 1) 모든 PNG는 같은 크기라고 가정
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const firstDecoded = PNG.sync.read(frames[0].png) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const width = firstDecoded.width;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const height = firstDecoded.height;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const bitDepth = firstDecoded.bitDepth || 8;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const colorType = firstDecoded.colorType || 6; // RGBA

  // 2) 기본 chunks
  const out: Buffer[] = [];
  out.push(PNG_SIGNATURE);

  // IHDR
  {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(bitDepth, 8);
    ihdr.writeUInt8(colorType, 9);
    ihdr.writeUInt8(0, 10); // compression
    ihdr.writeUInt8(0, 11); // filter
    ihdr.writeUInt8(0, 12); // interlace
    out.push(makeChunk('IHDR', ihdr));
  }

  // acTL (APNG control) - 전체 프레임 수, loop
  {
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(frames.length, 0); // num_frames
    buf.writeUInt32BE(loopCount, 4); // num_plays (0 → 무한)
    out.push(makeChunk('acTL', buf));
  }

  let sequenceNumber = 0;

  // 각 프레임 처리
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const decoded = PNG.sync.read(f.png) as any;

    const delayNum = f.delayNum ?? 1;
    const delayDen = f.delayDen ?? 10; // 1/10초
    const disposeOp = f.disposeOp ?? 0;
    const blendOp = f.blendOp ?? 0;

    // fcTL
    {
      const buf = Buffer.alloc(26);
      buf.writeUInt32BE(sequenceNumber++, 0); // seq
      buf.writeUInt32BE(width, 4);
      buf.writeUInt32BE(height, 8);
      buf.writeUInt32BE(0, 12); // x_offset
      buf.writeUInt32BE(0, 16); // y_offset
      buf.writeUInt16BE(delayNum, 20);
      buf.writeUInt16BE(delayDen, 22);
      buf.writeUInt8(disposeOp, 24);
      buf.writeUInt8(blendOp, 25);
      out.push(makeChunk('fcTL', buf));
    }

    // 첫 프레임은 IDAT으로, 이후 프레임은 fdAT으로
    // pngjs가 준 raw RGBA를 다시 zlib 압축해서 써야 한다.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const raw = decoded.data as Buffer;
    const bytesPerPixel = 4;
    const stride = width * bytesPerPixel;
    const scanlines: Buffer[] = [];

    for (let y = 0; y < height; y++) {
      // 필터 타입 0
      const line = Buffer.alloc(1 + stride);
      line.writeUInt8(0, 0);
      raw.copy(line, 1, y * stride, (y + 1) * stride);
      scanlines.push(line);
    }

    const compressed = zlib.deflateSync(Buffer.concat(scanlines));

    if (i === 0) {
      // 첫 프레임
      out.push(makeChunk('IDAT', compressed));
    } else {
      // 나머지 프레임은 fdAT (seq + compressed)
      const fd = Buffer.alloc(4 + compressed.length);
      fd.writeUInt32BE(sequenceNumber++, 0); // seq
      compressed.copy(fd, 4);
      out.push(makeChunk('fdAT', fd));
    }
  }

  // IEND
  out.push(makeChunk('IEND', Buffer.alloc(0)));

  //   const apngBuffer = Buffer.concat(out);
  //   const base64 = apngBuffer.toString('base64');
  //   return `data:image/apng;base64,${base64}`;
  return Buffer.concat(out);
}
