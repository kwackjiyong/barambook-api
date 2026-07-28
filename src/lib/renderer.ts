import { PNG } from 'pngjs';
import { Buffer } from 'node:buffer';
import { EPF, PAL, TBL } from './assets';
import {
  decodeBodyEpfItem,
  decodeEpfItem,
  decodeWeaponEpfItem,
} from './epfDecoder';
import { cyclePalette } from './paletteAnimation';
import { tryLoadCharMsAssets } from './char-ms/assets';
import type { CharMsLogicalPart } from './char-ms/format';
import {
  renderCharMsLayers,
  sortCharMsLayers,
  toCharMsAppearance,
  type CharMsSortableLayer,
  type LegacyPart,
} from './char-ms/renderer';
import { DecodedBitmap, RenderParams } from './types';

type Part4 = 'head' | 'body' | 'weapon' | 'shield';

/** 메월 데이터의 부위 이름 → 고전 렌더러의 부위 이름. */
const LOGICAL_PART_BY_LEGACY_PART: Record<Part4, CharMsLogicalPart> = {
  head: 'head',
  body: 'armor',
  weapon: 'weapon',
  shield: 'shield',
};

const CLASSIC_CODE_BY_PART: Record<Part4, string> = {
  weapon: 'w',
  body: 'b',
  head: 'h',
  shield: 's',
};

const CHAR_MS_PART_ORDER: Record<Part4, number> = {
  weapon: 1,
  body: 2,
  head: 3,
  shield: 6,
};

const LEGACY_PARTS: Part4[] = ['head', 'body', 'weapon', 'shield'];

/**
 * 고전 EPF로 그리지 않아도 되는 부위. char-ms가 이미 그렸거나, 착용하지
 * 않았거나, 얼굴+헤어 모드라 완성 머리를 쓰지 않는 경우다.
 */
function resolveLegacySkip(
  params: RenderParams,
  covered: Set<LegacyPart> | null,
  hidden: Set<LegacyPart> | null,
) {
  const skip = new Set<LegacyPart>();

  if (!covered) {
    return skip;
  }

  for (const part of LEGACY_PARTS) {
    if (covered.has(part) || hidden?.has(part)) {
      skip.add(part);
    }
  }

  if (params.headMode === 'face-hair') {
    skip.add('head');
  }

  if ((params.weapon | 0) < 0) {
    skip.add('weapon');
  }

  if ((params.shield | 0) < 0) {
    skip.add('shield');
  }

  return skip;
}

/**
 * 메월 레이어와 폴백 EPF 레이어를 하나의 z-order로 합친다.
 * 폴백 부위는 같은 동작 토큰의 layer 슬롯을 물려받아 원래 자리에 들어간다.
 */
function mergeCharMsAndLegacy(
  charMs: NonNullable<ReturnType<typeof renderCharMsLayers>>,
  legacyBitmaps: Array<{ part: Part4; bitmap: DecodedBitmap }>,
) {
  const layers: CharMsSortableLayer[] = charMs.layers.map((layer) => ({
    logicalPart: layer.logicalPart,
    token: layer.token,
    partOrder: layer.partOrder,
    bitmap: layer.bitmap,
  }));

  for (const entry of legacyBitmaps) {
    const slot = charMs.layerSlotByPart.get(entry.part);
    const classicRank = charMs.classicOrder.indexOf(
      CLASSIC_CODE_BY_PART[entry.part],
    );

    layers.push({
      logicalPart: LOGICAL_PART_BY_LEGACY_PART[entry.part],
      token: {
        worldFrame: charMs.pose.tick,
        layer:
          slot ??
          (classicRank >= 0 ? classicRank + 1 : CHAR_MS_PART_ORDER[entry.part]),
      },
      partOrder: CHAR_MS_PART_ORDER[entry.part],
      bitmap: entry.bitmap,
    });
  }

  return sortCharMsLayers(layers, charMs.classicOrder).map(
    (layer) => layer.bitmap,
  );
}

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
  const defaultWH = 120;
  const width = params.width ?? defaultWH;
  const height = params.height ?? defaultWH;
  const num = params.frame | 0;
  const colorTick = params.colorTick ?? 0;

  const rowHead = TBL.head[params.head] ?? { _u1: 0, _u2: 0, _u3: 0 };
  const rowBody = TBL.body[params.body] ?? { _u1: 0, _u2: 0, _u3: 0 };
  const rowShld = TBL.shield[params.shield] ?? { _u1: 0, _u2: 0, _u3: -1 };

  const palHead = cyclePalette(
    PAL.head[rowHead._u2] ?? PAL.head[0],
    colorTick,
    true,
  );
  const palBody = cyclePalette(
    params.bodyc >= 255
      ? PAL.body[113 + params.bodyc / 255]
      : (PAL.body[rowBody._u2] ?? PAL.body[0]),
    colorTick,
    // 커스텀 염색(>=255)은 현재 방향 유지, 원본 데이터 순환만 역방향 적용
    params.bodyc < 255,
  );
  const palShld = cyclePalette(
    PAL.shield[rowShld._u2] ?? PAL.shield[0],
    colorTick,
    true,
  );

  const charMsAssets = await tryLoadCharMsAssets();
  const charMs = charMsAssets
    ? renderCharMsLayers(
        charMsAssets,
        toCharMsAppearance(params),
        num,
        colorTick,
      )
    : null;
  const skip = resolveLegacySkip(
    params,
    charMs?.covered ?? null,
    charMs?.hidden ?? null,
  );
  const legacyBitmaps: Array<{ part: Part4; bitmap: DecodedBitmap }> = [];
  const push = (part: Part4, bitmap: DecodedBitmap) =>
    legacyBitmaps.push({ part, bitmap });

  // Special front shield overlay at frames 35/47/51 -> base + (num-32)
  // 양손무기 CASE: 방패 처리
  if (
    !skip.has('shield') &&
    params.shield >= 0 &&
    [34, 35, 36, 37, 44, 46, 47, 50, 51].includes(num)
  ) {
    const idx = rowShld._u3 + (num - 32);
    push(
      'shield',
      decodeEpfItem(EPF.shield.items[idx], palShld, params.shieldc | 0),
    );
  }

  for (const part of orderFor(num)) {
    if (skip.has(part)) {
      continue;
    }

    if (part === 'head') {
      if (num >= 0 && num <= 103) {
        push(
          'head',
          decodeEpfItem(
            EPF.head.items[rowHead._u3 + num],
            palHead,
            params.headc | 0,
          ),
        );
      } else {
        const idx = Math.floor(rowHead._u3 / 5) + (num % 104);
        push(
          'head',
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
      push(
        'body',
        decodeBodyEpfItem(
          EPF.body.items[rowBody._u3 + bodyNum],
          palBody,
          params.body,
          params.bodyc | 0,
        ),
      );
    } else if (part === 'weapon') {
      const w = params.weapon | 0;
      const palleteNum = params.weaponc / 255 - 1;
      if (w >= 0 && w < 10000) {
        const rowSword = TBL.sword[w] ?? { _u1: 0, _u2: 0, _u3: 0 };
        const palSword = cyclePalette(
          PAL.sword[rowSword._u2] ?? PAL.sword[0],
          colorTick,
          true,
        );
        if (num >= 12 && num <= 31) {
          const idx = rowSword._u3 + (num - 12);
          // decodeEpfItem(EPF.sword.items[idx], palSword, params.weaponc | 0),
          push(
            'weapon',
            decodeWeaponEpfItem(
              EPF.sword.items[idx],
              palSword,
              PAL.weapon[palleteNum],
              rowSword._u2,
              'sword',
              params.weapon,
              params.weaponrc | 0,
              params.weaponc | 0,
              params.weaponAnic ?? -1,
            ),
          );
        }
      } else if (w >= 10000 && w < 20000) {
        const w2 = w - 10000;
        const rowSpear = TBL.spear[w2] ?? { _u1: 0, _u2: 0, _u3: 0 };
        const palSpear = cyclePalette(
          PAL.spear[rowSpear._u2] ?? PAL.spear[0],
          colorTick,
          true,
        );
        if (num >= 32 && num <= 51) {
          const idx = rowSpear._u3 + (num - 32);
          // decodeEpfItem(EPF.spear.items[idx], palSpear, params.weaponc | 0),
          push(
            'weapon',
            decodeWeaponEpfItem(
              EPF.spear.items[idx],
              palSpear,
              PAL.weapon[palleteNum],
              rowSpear._u2,
              'spear',
              params.weapon,
              params.weaponrc | 0,
              params.weaponc | 0,
              params.weaponAnic ?? -1,
            ),
          );
        }
      } else if (w >= 30000 && w < 40000) {
        const w2 = w - 30000;
        const rowFan = TBL.fan[w2] ?? { _u1: 0, _u2: 0, _u3: 0 };
        const palFan = cyclePalette(
          PAL.fan[rowFan._u2] ?? PAL.fan[0],
          colorTick,
          true,
        );
        if (num >= 12 && num <= 31) {
          const idx = rowFan._u3 + (num - 13);
          // decodeEpfItem(EPF.fan.items[idx], palFan, params.weaponc | 0),
          push(
            'weapon',
            decodeWeaponEpfItem(
              EPF.fan.items[idx],
              palFan,
              PAL.weapon[palleteNum],
              rowFan._u2,
              'fan',
              params.weapon,
              params.weaponrc | 0,
              params.weaponc | 0,
              params.weaponAnic ?? -1,
            ),
          );
        }
      }
    } else if (part === 'shield' && params.shield >= 0) {
      if (num >= 0 && num <= 11) {
        push(
          'shield',
          decodeEpfItem(
            EPF.shield.items[rowShld._u3 + num],
            palShld,
            params.shieldc | 0,
          ),
        );
      } else if (num >= 12 && num <= 31) {
        push(
          'shield',
          decodeEpfItem(
            EPF.shield.items[rowShld._u3 + (num - 12)],
            palShld,
            params.shieldc | 0,
          ),
        );
      }
    }

    // 양손무기 CASE: 방패 처리
    if (
      [38, 39, 40, 32, 33, 41, 42, 43, 48, 49, 45].includes(num) &&
      params.shield >= 0
    ) {
      const idx = rowShld._u3 + (num - 32);
      push(
        'shield',
        decodeEpfItem(EPF.shield.items[idx], palShld, params.shieldc | 0),
      );
    }
  }

  const bitmaps: DecodedBitmap[] = charMs
    ? mergeCharMsAndLegacy(charMs, legacyBitmaps)
    : legacyBitmaps.map((entry) => entry.bitmap);

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
        if (a == 0) continue;
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
