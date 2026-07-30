export interface PixelSurface {
  setPixel(
    x: number,
    y: number,
    red: number,
    green: number,
    blue: number,
    alpha?: number,
  ): void;
}

export type OldBaramPalette = Array<[number, number, number]>;

interface EpfItem {
  top: number;
  left: number;
  bottom: number;
  right: number;
  pixel: number;
  mask: number;
}

export class EpfImage {
  readonly items: EpfItem[] = [];
  private readonly pixelBlock: Uint8Array;

  constructor(bytes: Uint8Array) {
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
    let offset = 0;
    const count = view.getInt16(offset, true);
    offset += 2 + 6;
    const pixelBlockLength = view.getInt32(offset, true);
    offset += 4;
    this.pixelBlock = bytes.subarray(offset, offset + pixelBlockLength);
    offset += pixelBlockLength;

    for (let index = 0; index < count; index += 1) {
      this.items.push({
        top: view.getInt16(offset, true),
        left: view.getInt16(offset + 2, true),
        bottom: view.getInt16(offset + 4, true),
        right: view.getInt16(offset + 6, true),
        pixel: view.getInt32(offset + 8, true),
        mask: view.getInt32(offset + 12, true),
      });
      offset += 16;
    }
  }

  draw(
    surface: PixelSurface,
    x: number,
    y: number,
    index: number,
    variantColor: number,
    palette: OldBaramPalette,
    alpha = 255,
  ): void {
    const item = this.items[index];
    if (!item || !palette) return;

    const width = item.right - item.left;
    const height = item.bottom - item.top;
    if (width <= 0 || height <= 0) return;

    const pixels = this.pixelBlock.subarray(
      item.pixel,
      item.pixel + width * height,
    );
    let maskOffset = item.mask;

    for (let row = 0; row < height; row += 1) {
      let column = 0;
      let token = this.pixelBlock[maskOffset++];
      while (token !== 0) {
        const count = token & 127;
        if ((token & 128) !== 0) {
          for (
            let delta = 0;
            delta < count && column + delta < width;
            delta += 1
          ) {
            let colorIndex = pixels[row * width + column + delta];
            if (colorIndex >= 48) {
              colorIndex = (colorIndex + variantColor * 8) & 0xff;
            }
            const color = palette[colorIndex];
            if (color) {
              surface.setPixel(
                x + item.left + column + delta,
                y + item.top + row,
                color[0],
                color[1],
                color[2],
                alpha,
              );
            }
          }
        }
        column += count;
        token = this.pixelBlock[maskOffset++];
      }
    }
  }

  getBounds(index: number) {
    const item = this.items[index];
    if (!item) return null;
    return {
      left: item.left,
      top: item.top,
      right: item.right,
      bottom: item.bottom,
      width: item.right - item.left,
      height: item.bottom - item.top,
    };
  }
}
