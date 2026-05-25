// PAL animation metadata extraction + merge into existing pal JSON files.
//
// - Reads existing src/assets/pal/<name>_pal.json (legacy format: Rgb[][])
// - Parses <name>.pal from char.dat with animation metadata
// - For each existing palette index P, writes:
//     { animationColorCount, animationOffsets, colors }
//   where:
//     colors                = existing colors at index P (preserved as-is)
//     animationColorCount   = from char.dat palette[P] if present, else 0
//     animationOffsets      = from char.dat palette[P] if present, else []
//
// Targets: body, sword, spear, shield, fan (emotion intentionally skipped).
//
// Usage:
//   node scripts/extract-pal.mjs <path-to-char.dat> [outDir]
//
// outDir defaults to src/assets/pal (overwrites in place).

import fs from 'node:fs';
import path from 'node:path';

const DLPALETTE_HEADER = 'DLPalette';

function parseArgs() {
  const [, , datPath, outDirArg] = process.argv;
  if (!datPath) {
    console.error(
      'Usage: node scripts/extract-pal.mjs <path-to-char.dat> [outDir]',
    );
    process.exit(1);
  }
  const outDir =
    outDirArg ?? path.resolve(process.cwd(), 'src', 'assets', 'pal');
  return { datPath, outDir };
}

class Reader {
  constructor(buf) {
    this.buf = buf;
    this.off = 0;
  }
  readU32LE() {
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
  readI32LE() {
    const v = this.buf.readInt32LE(this.off);
    this.off += 4;
    return v;
  }
  readU16LE() {
    const v = this.buf.readUInt16LE(this.off);
    this.off += 2;
    return v;
  }
  readU8() {
    return this.buf[this.off++];
  }
  readBytes(n) {
    const slice = this.buf.subarray(this.off, this.off + n);
    this.off += n;
    return slice;
  }
  readAscii(n) {
    const s = this.buf.toString('ascii', this.off, this.off + n);
    this.off += n;
    return s;
  }
  skip(n) {
    this.off += n;
  }
}

function parseDat(buf) {
  const r = new Reader(buf);
  const fileCount = r.readI32LE();
  const items = [];
  for (let i = 0; i < fileCount; i += 1) {
    const offset = r.readI32LE();
    const nameRaw = r.readBytes(13);
    let end = nameRaw.indexOf(0);
    if (end < 0) end = nameRaw.length;
    const name = nameRaw.slice(0, end).toString('latin1');
    items.push({ offset, name });
  }
  const entries = new Map();
  for (let i = 0; i < items.length; i += 1) {
    const cur = items[i];
    const nextOffset =
      i + 1 < items.length ? items[i + 1].offset : buf.length;
    entries.set(cur.name.toUpperCase(), buf.subarray(cur.offset, nextOffset));
  }
  return entries;
}

function parsePal(buf) {
  const r = new Reader(buf);
  const header9 = r.readAscii(9);
  r.off = 0;

  let paletteCount = 1;
  if (header9 !== DLPALETTE_HEADER) {
    paletteCount = r.readI32LE();
  }

  const palettes = [];
  for (let i = 0; i < paletteCount; i += 1) {
    const pHeader = r.readAscii(9);
    if (pHeader !== DLPALETTE_HEADER) {
      throw new Error(
        `Palette ${i}: expected "DLPalette" header, got ${JSON.stringify(pHeader)}`,
      );
    }
    r.skip(15);
    const animationColorCount = r.readU8();
    r.skip(7);

    const animationOffsets = [];
    for (let j = 0; j < animationColorCount; j += 1) {
      animationOffsets.push(r.readU16LE());
    }

    const colors = new Array(256);
    for (let j = 0; j < 256; j += 1) {
      const cr = r.readU8();
      const cg = r.readU8();
      const cb = r.readU8();
      r.readU8();
      colors[j] = { r: cr, g: cg, b: cb };
    }

    palettes.push({ animationColorCount, animationOffsets, colors });
  }
  return palettes;
}

const TARGETS = [
  { entry: 'BODY.PAL', file: 'body_pal.json' },
  { entry: 'SWORD.PAL', file: 'sword_pal.json' },
  { entry: 'SPEAR.PAL', file: 'spear_pal.json' },
  { entry: 'SHIELD.PAL', file: 'shield_pal.json' },
  { entry: 'FAN.PAL', file: 'fan_pal.json' },
];

function mergeOne(existingColorsList, newPalettes) {
  // existingColorsList: Rgb[][]
  // newPalettes:        { animationColorCount, animationOffsets, colors }[]
  return existingColorsList.map((colors, i) => {
    const fromDat = newPalettes[i];
    return {
      animationColorCount: fromDat?.animationColorCount ?? 0,
      animationOffsets: fromDat?.animationOffsets ?? [],
      colors,
    };
  });
}

function main() {
  const { datPath, outDir } = parseArgs();
  if (!fs.existsSync(datPath)) {
    console.error(`char.dat not found: ${datPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Reading: ${datPath}`);
  const buf = fs.readFileSync(datPath);
  const entries = parseDat(buf);
  console.log(`DAT entries: ${entries.size}`);

  for (const target of TARGETS) {
    const data = entries.get(target.entry);
    if (!data) {
      console.warn(`SKIP: ${target.entry} not present in DAT`);
      continue;
    }

    let newPalettes;
    try {
      newPalettes = parsePal(Buffer.from(data));
    } catch (e) {
      console.error(`PARSE FAIL: ${target.entry} -> ${e.message}`);
      continue;
    }

    const existingPath = path.join(outDir, target.file);
    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    } catch (e) {
      console.error(
        `READ EXISTING FAIL: ${existingPath} -> ${e.message}. Skipping.`,
      );
      continue;
    }

    // Tolerate already-merged format (idempotent re-run): extract .colors if present.
    const existingColors = existing.map((p) =>
      Array.isArray(p) ? p : p.colors,
    );

    const merged = mergeOne(existingColors, newPalettes);

    const animatedInMerged = merged.filter(
      (p) => p.animationColorCount > 0,
    ).length;
    const overlap = Math.min(existingColors.length, newPalettes.length);
    const onlyInExisting = existingColors.length - overlap;
    const animatedInDat = newPalettes.filter(
      (p) => p.animationColorCount > 0,
    ).length;

    fs.writeFileSync(existingPath, JSON.stringify(merged, null, 2));
    console.log(
      `WROTE: ${existingPath}`,
      `palettes=${merged.length}`,
      `(overlap=${overlap}, only-existing=${onlyInExisting})`,
      `animated-in-dat=${animatedInDat}`,
      `animated-after-merge=${animatedInMerged}`,
    );
  }
}

main();
