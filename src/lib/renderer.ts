import { PNG } from 'pngjs';
import { Buffer } from 'node:buffer';
import { EPF, PAL, TBL } from './assets';
import { decodeEpfItem } from './epfDecoder';
import { RenderParams } from './types';

type Part4 = 'head' | 'body' | 'weapon' | 'shield';

function orderFor(frame: number): Part4[] {
  const s = TBL.order[frame % TBL.order.length] || 'wbhs';
  const map: Record<string, Part4> = {
    w: 'weapon',
    b: 'body',
    h: 'head',
    s: 'shield',
  };
  return s
    .split('')
    .map((c) => map[c])
    .filter(Boolean);
}

export async function renderToPng(params: RenderParams): Promise<Buffer> {
  const defaultWH = 90;
  const width = params.width ?? defaultWH;
  const height = params.height ?? defaultWH;
  const num = params.frame | 0;

  const rowHead = TBL.head[params.head] ?? { _u1: 0, _u2: 0, _u3: 0 };
  const rowBody = TBL.body[params.body] ?? { _u1: 0, _u2: 0, _u3: 0 };
  const rowShld = TBL.shield[params.shield] ?? { _u1: 0, _u2: 0, _u3: -1 };

  const palHead = PAL.head[rowHead._u2] ?? PAL.head[0];
  const palBody = PAL.body[rowBody._u2] ?? PAL.body[0];
  const palShld = PAL.shield[rowShld._u2] ?? PAL.shield[0];

  const bitmaps = [] as ReturnType<typeof decodeEpfItem>[];

  // Special front shield overlay at frames 35/47/51 -> base + (num-32)
  // 양손무기 CASE: 방패 처리
  if (params.shield >= 0 && [35, 47, 51].includes(num)) {
    const idx = rowShld._u3 + (num - 32);
    bitmaps.push(
      decodeEpfItem(EPF.shield.items[idx], palShld, params.shieldc | 0),
    );
  }

  for (const part of orderFor(num)) {
    if (part === 'head') {
      if (num >= 0 && num <= 103) {
        bitmaps.push(
          decodeEpfItem(
            EPF.head.items[rowHead._u3 + num],
            palHead,
            params.headc | 0,
          ),
        );
      } else {
        const idx = Math.floor(rowHead._u3 / 5) + (num % 104);
        bitmaps.push(
          decodeEpfItem(EPF.emotion.items[idx], palHead, params.headc | 0),
        );
      }
    } else if (part === 'body') {
      let bodyNum = num > 103 ? 6 : num;
      if (num > 103) {
        if (num === 113) bodyNum = 95;
        if (num === 115) bodyNum = 100;
        if (num === 116) bodyNum = 101;
        if (num === 117) bodyNum = 102;
        if (num === 118) bodyNum = 103;
        if (num === 120) bodyNum = 96;
        if (num === 121) bodyNum = 97;
        if (num === 122) bodyNum = 98;
        if (num === 123) bodyNum = 99;
      }
      bitmaps.push(
        decodeEpfItem(
          EPF.body.items[rowBody._u3 + bodyNum],
          palBody,
          params.bodyc | 0,
        ),
      );
    } else if (part === 'weapon') {
      const w = params.weapon | 0;
      if (w >= 0 && w < 10000) {
        const rowSword = TBL.sword[w] ?? { _u1: 0, _u2: 0, _u3: 0 };
        const palSword = PAL.sword[rowSword._u2] ?? PAL.sword[0];
        if (num >= 12 && num <= 31) {
          const idx = rowSword._u3 + (num - 12);
          bitmaps.push(
            decodeEpfItem(EPF.sword.items[idx], palSword, params.weaponc | 0),
          );
        }
      } else if (w >= 10000 && w < 20000) {
        const w2 = w - 10000;
        const rowSpear = TBL.spear[w2] ?? { _u1: 0, _u2: 0, _u3: 0 };
        const palSpear = PAL.spear[rowSpear._u2] ?? PAL.spear[0];
        if (num >= 32 && num <= 51) {
          const idx = rowSpear._u3 + (num - 32);
          bitmaps.push(
            decodeEpfItem(EPF.spear.items[idx], palSpear, params.weaponc | 0),
          );
        }
      } else if (w >= 30000 && w < 40000) {
        const w2 = w - 30000;
        const rowFan = TBL.fan[w2] ?? { _u1: 0, _u2: 0, _u3: 0 };
        const palFan = PAL.fan[rowFan._u2] ?? PAL.fan[0];
        if (num >= 12 && num <= 31) {
          const idx = rowFan._u3 + (num - 12);
          bitmaps.push(
            decodeEpfItem(EPF.fan.items[idx], palFan, params.weaponc | 0),
          );
        }
      }
    } else if (part === 'shield' && params.shield >= 0) {
      if (num >= 0 && num <= 11) {
        bitmaps.push(
          decodeEpfItem(
            EPF.shield.items[rowShld._u3 + num],
            palShld,
            params.shieldc | 0,
          ),
        );
      } else if (num >= 12 && num <= 31) {
        bitmaps.push(
          decodeEpfItem(
            EPF.shield.items[rowShld._u3 + (num - 12)],
            palShld,
            params.shieldc | 0,
          ),
        );
      }
    }

    // 양손무기 CASE: 방패 처리
    if ([38, 32, 41, 49, 45].includes(num) && params.shield >= 0) {
      const idx = rowShld._u3 + (num - 32);
      bitmaps.push(
        decodeEpfItem(EPF.shield.items[idx], palShld, params.shieldc | 0),
      );
    }
  }

  // Composite (center anchor + left/top offsets) -> RGBA -> PNG
  const out = new Uint8ClampedArray(width * height * 4);
  const anchorX = (width / 2) | 0,
    anchorY = (height / 2 + 18) | 0;
  for (const bmp of bitmaps) {
    const dstX = anchorX + bmp.left,
      dstY = anchorY + bmp.top;
    for (let y = 0; y < bmp.h; y++) {
      const dy = dstY + y;
      if (dy < 0 || dy >= height) continue;
      for (let x = 0; x < bmp.w; x++) {
        const dx = dstX + x;
        if (dx < 0 || dx >= width) continue;
        const s = (y * bmp.w + x) * 4,
          d = (dy * width + dx) * 4;
        const a = bmp.rgba[s + 3];
        if (a === 0) continue;
        out[d] = bmp.rgba[s];
        out[d + 1] = bmp.rgba[s + 1];
        out[d + 2] = bmp.rgba[s + 2];
        out[d + 3] = 255;
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const png = new PNG({ width, height });
  const u8 = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  png.data = Buffer.from(u8);
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    png
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .pack()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .on('data', (d: Buffer) => chunks.push(d))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .on('end', () => resolve(Buffer.concat(chunks)))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .on('error', reject);
  });
}
