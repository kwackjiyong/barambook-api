import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import {
  createCharMsAtlasRuntime,
  createCharMsItemNameRuntime,
  createCharMsPaletteRuntime,
  getCharMsPngBytes,
  readCharMsDat,
  type CharMsAtlasLabel,
  type CharMsAtlasRuntime,
  type CharMsItemNameRuntime,
  type CharMsLogicalPart,
  type CharMsPaletteRuntime,
} from './format';
import {
  isEditableItemNames,
  mergeCharMsItemNames,
  type EditableItemNames,
} from './item-names';
import { buildCharMsPoseTable, type CharMsPoseTable } from './frames';

// 로컬 사본이 있으면 그걸 쓰고, 없으면 CDN에서 받는다.
// 두 파일 모두 {CDN_URL}/data/char/ 아래에 올라가 있다.
const CDN_ROOT =
  process.env.CHAR_MS_CDN_ROOT ??
  'https://d9dw0d9hih79y.cloudfront.net/data/char';
const LOCAL_ROOT = path.resolve(
  path.join(process.cwd(), 'src', 'assets', 'dat'),
);
const DAT_FILE = 'char-ms.dat';
const ITEM_NAMES_FILE = 'char-ms-item-names.json';

export interface CharMsAtlasPixels {
  width: number;
  height: number;
  indexed: boolean;
  /** indexed일 때만 채워진다. 길이 = width * height. */
  indices: Uint8Array | null;
  /** indexed가 아닐 때만 채워진다. 길이 = width * height * 4. */
  rgba: Uint8ClampedArray | null;
}

export interface CharMsAtlasAssets extends CharMsAtlasRuntime {
  pixels: CharMsAtlasPixels;
}

export interface CharMsAssets {
  atlases: CharMsAtlasAssets[];
  atlasByLabel: Map<CharMsAtlasLabel, CharMsAtlasAssets>;
  atlasesByLogicalPart: Map<CharMsLogicalPart, CharMsAtlasAssets[]>;
  palettes: CharMsPaletteRuntime | null;
  itemNames: CharMsItemNameRuntime;
  drawOrders: string[];
  transparentIndex: number;
  poseTable: CharMsPoseTable;
}

async function readAsset(fileName: string): Promise<Buffer | null> {
  const localPath = path.join(LOCAL_ROOT, fileName);

  try {
    return await fs.promises.readFile(localPath);
  } catch {
    // 로컬 사본이 없으면 CDN으로 넘어간다.
  }

  const response = await fetch(`${CDN_ROOT}/${fileName}`);

  if (!response.ok) {
    return null;
  }

  return Buffer.from(await response.arrayBuffer());
}

/** pngjs에는 타입 선언이 없어 필요한 부분만 좁혀서 쓴다. */
interface DecodedPng {
  width: number;
  height: number;
  data: Buffer;
}

/**
 * 인덱스 아틀라스는 RGB가 0이고 alpha 채널이 팔레트 색상 인덱스다.
 * RGBA로 들고 있으면 159MB가 되므로 alpha만 1바이트 인덱스 맵으로 남긴다.
 */
function toAtlasPixels(png: DecodedPng, indexed: boolean): CharMsAtlasPixels {
  const { width, height, data } = png;

  if (!indexed) {
    return {
      width,
      height,
      indexed: false,
      indices: null,
      rgba: new Uint8ClampedArray(data),
    };
  }

  const indices = new Uint8Array(width * height);

  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    indices[pixel] = data[pixel * 4 + 3];
  }

  return { width, height, indexed: true, indices, rgba: null };
}

function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  return new Promise((resolve, reject) => {
    /* eslint-disable @typescript-eslint/no-unsafe-call */
    const png = new PNG() as unknown as {
      parse(
        buffer: Buffer,
        callback: (error: Error | null, png: DecodedPng) => void,
      ): void;
    };
    /* eslint-enable @typescript-eslint/no-unsafe-call */

    png.parse(Buffer.from(bytes), (error, decoded) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      resolve(decoded);
    });
  });
}

async function loadEditableItemNames(): Promise<EditableItemNames | null> {
  try {
    const bytes = await readAsset(ITEM_NAMES_FILE);

    if (!bytes) {
      return null;
    }

    const value: unknown = JSON.parse(bytes.toString('utf8'));
    return isEditableItemNames(value) ? value : null;
  } catch {
    return null;
  }
}

async function loadCharMs(): Promise<CharMsAssets> {
  const [datBytes, editableItemNames] = await Promise.all([
    readAsset(DAT_FILE),
    loadEditableItemNames(),
  ]);

  if (!datBytes) {
    throw new Error('char-ms.dat을 찾을 수 없습니다.');
  }

  // PNG CRC 8개까지 검사하면 18MB를 한 번 더 훑게 되므로 manifest CRC만 확인한다.
  const data = readCharMsDat(new Uint8Array(datBytes), { verify: false });
  const atlases: CharMsAtlasAssets[] = [];

  for (const atlas of data.manifest.atlases) {
    const png = await decodePng(getCharMsPngBytes(data, atlas));

    atlases.push({
      ...createCharMsAtlasRuntime(atlas),
      pixels: toAtlasPixels(png, atlas.indexed),
    });
  }

  const atlasesByLogicalPart = new Map<
    CharMsLogicalPart,
    CharMsAtlasAssets[]
  >();

  for (const atlas of atlases) {
    const group = atlasesByLogicalPart.get(atlas.logicalPart) ?? [];
    group.push(atlas);
    atlasesByLogicalPart.set(atlas.logicalPart, group);
  }

  for (const group of atlasesByLogicalPart.values()) {
    group.sort((first, second) => first.sequence - second.sequence);
  }

  const assets: CharMsAssets = {
    atlases,
    atlasByLabel: new Map(atlases.map((atlas) => [atlas.label, atlas])),
    atlasesByLogicalPart,
    palettes: createCharMsPaletteRuntime(data.manifest.palettes),
    itemNames: createCharMsItemNameRuntime(
      mergeCharMsItemNames(data.manifest.itemNames, editableItemNames),
    ),
    drawOrders: data.manifest.drawOrder?.orders ?? [],
    transparentIndex: data.manifest.transparentIndex ?? 1,
    poseTable: new Map(),
  };

  assets.poseTable = buildCharMsPoseTable(assets);
  return assets;
}

let assetsPromise: Promise<CharMsAssets> | null = null;

export function loadCharMsAssets() {
  if (!assetsPromise) {
    assetsPromise = loadCharMs().catch((error) => {
      assetsPromise = null;
      throw error;
    });
  }

  return assetsPromise;
}

/** 메월 팩이 없어도 기존 EPF 렌더링은 그대로 동작해야 하므로 실패를 삼킨다. */
export async function tryLoadCharMsAssets() {
  try {
    return await loadCharMsAssets();
  } catch {
    return null;
  }
}
