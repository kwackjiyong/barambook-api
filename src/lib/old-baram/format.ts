import type { OldBaramPalette } from './epf-image';

export const NO_FRAME = 0xffffffff;

export interface DrawEntry {
  frame?: number;
  palette?: number;
  perDye?: number[];
  perDyePalettes?: number[];
}

export interface AnimationFrame {
  frame: number;
  palette: number;
}

export interface AnimationEntry {
  frames?: AnimationFrame[];
  overrides?: Array<Array<[number, [number, number, number]]>>;
}

export interface OldBaramItemMeta {
  id: number;
  dyes: number[];
}

export interface OldBaramPartMeta {
  base: number;
  items: OldBaramItemMeta[];
}

export interface OldBaramMeta {
  parts: Record<string, OldBaramPartMeta>;
  bodyShadowChoice?: Record<string, number>;
}

export type OldBaramTable = Map<
  string,
  Map<number, Map<number, DrawEntry>>
>;

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function readObp(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = viewOf(bytes);
  if (view.byteLength < 8) throw new Error('OBP header is truncated.');
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== 'OBP2') throw new Error(`Invalid OBP magic: ${magic}`);

  const count = view.getUint32(4, true);
  let offset = 8;
  const sections = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint8(offset++);
    const name = new TextDecoder().decode(
      bytes.subarray(offset, offset + nameLength),
    );
    offset += nameLength;
    const sectionOffset = view.getUint32(offset, true);
    const sectionLength = view.getUint32(offset + 4, true);
    offset += 8;
    if (sectionOffset + sectionLength > bytes.byteLength) {
      throw new Error(`OBP section is truncated: ${name}`);
    }
    sections.set(
      name,
      bytes.subarray(sectionOffset, sectionOffset + sectionLength),
    );
  }
  return sections;
}

export function requireSection(
  sections: Map<string, Uint8Array>,
  name: string,
): Uint8Array {
  const section = sections.get(name);
  if (!section) throw new Error(`OBP section is missing: ${name}`);
  return section;
}

export function readPal(bytes: Uint8Array): OldBaramPalette[] {
  const view = viewOf(bytes);
  const count = view.getUint16(0, true);
  const palettes: OldBaramPalette[] = new Array(count);
  for (let paletteIndex = 0; paletteIndex < count; paletteIndex += 1) {
    const colors: OldBaramPalette = new Array(256);
    for (let colorIndex = 0; colorIndex < 256; colorIndex += 1) {
      const offset = 2 + (paletteIndex * 256 + colorIndex) * 3;
      colors[colorIndex] = [
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
      ];
    }
    palettes[paletteIndex] = colors;
  }
  return palettes;
}

export function readTbl(bytes: Uint8Array): OldBaramTable {
  const view = viewOf(bytes);
  let offset = 0;
  const partCount = view.getUint16(offset, true);
  offset += 2;
  const parts: OldBaramTable = new Map();

  for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
    const nameLength = view.getUint8(offset++);
    const name = new TextDecoder().decode(
      bytes.subarray(offset, offset + nameLength),
    );
    offset += nameLength;
    const itemCount = view.getUint16(offset, true);
    offset += 2;
    const items = new Map<number, Map<number, DrawEntry>>();

    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const itemId = view.getUint16(offset, true);
      const actionCount = view.getUint16(offset + 2, true);
      offset += 4;
      const actions = new Map<number, DrawEntry>();

      for (
        let actionIndex = 0;
        actionIndex < actionCount;
        actionIndex += 1
      ) {
        const actionId = view.getUint16(offset, true);
        const flags = view.getUint8(offset + 2);
        offset += 3;
        if ((flags & 1) !== 0) {
          const perDye = new Array<number>(32);
          const perDyePalettes = new Array<number>(32);
          for (let dye = 0; dye < 32; dye += 1) {
            perDye[dye] = view.getUint32(offset, true);
            perDyePalettes[dye] = view.getUint16(offset + 4, true);
            offset += 6;
          }
          actions.set(actionId, { perDye, perDyePalettes });
        } else {
          actions.set(actionId, {
            frame: view.getUint32(offset, true),
            palette: view.getUint16(offset + 4, true),
          });
          offset += 6;
        }
      }
      items.set(itemId, actions);
    }
    parts.set(name, items);
  }
  return parts;
}

export interface ShadowEntry {
  frame: number;
  palette: number;
}

export function readShadowTable(
  bytes: Uint8Array,
): Array<Array<ShadowEntry | null>> {
  const view = viewOf(bytes);
  let offset = 0;
  const listCount = view.getUint16(offset, true);
  offset += 2;
  const lists: Array<Array<ShadowEntry | null>> = [];
  for (let listIndex = 0; listIndex < listCount; listIndex += 1) {
    const count = view.getUint16(offset, true);
    offset += 2;
    const list = new Array<ShadowEntry | null>(count);
    for (let index = 0; index < count; index += 1) {
      const frame = view.getUint32(offset, true);
      const palette = view.getUint16(offset + 4, true);
      offset += 6;
      list[index] = frame === NO_FRAME ? null : { frame, palette };
    }
    lists.push(list);
  }
  return lists;
}

export function readMeta(bytes: Uint8Array): OldBaramMeta {
  return JSON.parse(new TextDecoder().decode(bytes)) as OldBaramMeta;
}

export function readAnim(bytes: Uint8Array): Map<string, AnimationEntry> {
  const view = viewOf(bytes);
  let offset = 0;
  const partCount = view.getUint16(offset, true);
  offset += 2;
  const entries = new Map<string, AnimationEntry>();

  for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
    const nameLength = view.getUint8(offset++);
    const name = new TextDecoder().decode(
      bytes.subarray(offset, offset + nameLength),
    );
    offset += nameLength;
    const count = view.getUint32(offset, true);
    offset += 4;

    for (let index = 0; index < count; index += 1) {
      const itemId = view.getUint16(offset, true);
      const actionId = view.getUint16(offset + 2, true);
      const dye = view.getUint8(offset + 4);
      const stepCount = view.getUint8(offset + 5);
      const flags = view.getUint8(offset + 6);
      offset += 7;

      if ((flags & 1) !== 0) {
        const frames = new Array<AnimationFrame>(stepCount);
        for (let step = 0; step < stepCount; step += 1) {
          frames[step] = {
            frame: view.getUint32(offset, true),
            palette: view.getUint16(offset + 4, true),
          };
          offset += 6;
        }
        entries.set(`${name}:${itemId}:${actionId}:${dye}`, { frames });
        continue;
      }

      const overrides = new Array<
        Array<[number, [number, number, number]]>
      >(stepCount);
      for (let step = 0; step < stepCount; step += 1) {
        const overrideCount = view.getUint8(offset++);
        const colors = new Array<[number, [number, number, number]]>(
          overrideCount,
        );
        for (
          let overrideIndex = 0;
          overrideIndex < overrideCount;
          overrideIndex += 1
        ) {
          colors[overrideIndex] = [
            view.getUint8(offset),
            [
              view.getUint8(offset + 1),
              view.getUint8(offset + 2),
              view.getUint8(offset + 3),
            ],
          ];
          offset += 4;
        }
        overrides[step] = colors;
      }
      entries.set(`${name}:${itemId}:${actionId}:${dye}`, { overrides });
    }
  }
  return entries;
}

export interface ResolvedDraw {
  frame: number;
  palette: OldBaramPalette;
  dye: number;
}

export function resolveDraw(
  entry: DrawEntry | undefined,
  palettes: OldBaramPalette[],
  dye: number,
  colorAnimationFrame: number,
  animation?: AnimationEntry,
): ResolvedDraw | null {
  if (!entry) return null;
  const frame = entry.perDye
    ? (entry.perDye[dye] ?? entry.perDye[0])
    : entry.frame;
  const paletteId = entry.perDye
    ? (entry.perDyePalettes?.[dye] ?? 0)
    : entry.palette;
  if (frame === undefined || paletteId === undefined) return null;

  const base: ResolvedDraw = {
    frame,
    palette: palettes[paletteId],
    dye: entry.perDye ? 0 : dye,
  };
  const steps = animation?.overrides ?? animation?.frames;
  if (!steps?.length) return base;

  const step = colorAnimationFrame % (steps.length + 1);
  if (step === 0) return base;
  if (animation?.frames) {
    const replacement = animation.frames[step - 1];
    return {
      frame: replacement.frame,
      palette: palettes[replacement.palette],
      dye: 0,
    };
  }

  const palette = base.palette.slice();
  for (const [slot, color] of animation?.overrides?.[step - 1] ?? []) {
    palette[slot] = color;
  }
  return { ...base, palette };
}

export function resourceIdOf(
  base: number,
  itemId: number,
  dye: number,
): number {
  return (itemId + base) * 100 + dye;
}
