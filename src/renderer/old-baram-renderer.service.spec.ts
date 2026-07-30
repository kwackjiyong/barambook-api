import { PNG } from 'pngjs';
import { OldBaramRendererService } from './old-baram-renderer.service';

describe('OldBaramRendererService', () => {
  let service: OldBaramRendererService;

  beforeAll(() => {
    service = new OldBaramRendererService();
    service.onModuleInit();
  });

  it('loads the single OBP pack and exposes selectable parts', () => {
    const options = service.getOptions();

    expect(options.pack.byteLength).toBeGreaterThan(20_000_000);
    expect(options.pack.frameCount).toBe(23_874);
    expect(options.pack.paletteCount).toBe(201);
    expect(options.parts.head).toHaveLength(102);
    expect(options.parts.body).toHaveLength(152);
    expect(options.parts.weapon).toHaveLength(220);
    expect(options.parts.shield).toHaveLength(22);
  });

  it('renders a composed character as a transparent PNG', () => {
    const buffer = service.render({
      head: 0,
      headDye: 0,
      body: 20,
      bodyDye: 0,
      weapon: 1,
      weaponDye: 0,
      shield: 0,
      shieldDye: 0,
      state: 'attack',
      direction: 1,
      frame: 0,
      colorFrame: 0,
      shadow: true,
      zoom: 4,
    });

    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    const png = PNG.sync.read(buffer);
    let painted = 0;
    for (let offset = 3; offset < png.data.length; offset += 4) {
      if (png.data[offset] > 0) painted += 1;
    }
    expect(painted).toBeGreaterThan(10_000);
  });

  it('rejects unknown part ids', () => {
    expect(() => service.render({ head: 999_999 })).toThrow(
      'head 999999번 아이템이 없습니다.',
    );
  });
});
