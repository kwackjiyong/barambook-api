import { PNG } from 'pngjs';
import { OldBaramRendererService } from './old-baram-renderer.service';

/** 동작 비교용 착용 조합. 그림자는 액션마다 프레임이 따로라 비교에서 뺀다. */
const WALKER = {
  head: 3,
  headDye: 0,
  body: 20,
  bodyDye: 0,
  weapon: -1,
  shield: -1,
  shadow: false,
  zoom: 1,
} as const;

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
    // 통파일에 실린 아이템 수. '없음'(-1)은 목록이 아니라 화면에서 얹는다.
    expect(options.parts.weapon).toHaveLength(219);
    expect(options.parts.shield).toHaveLength(21);
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

  it('walks by stepping through the standing pose between feet', () => {
    const options = service.getOptions();
    expect(options.states.find((state) => state.key === 'move')?.frames).toBe(
      4,
    );

    const pose = (frame: number) =>
      service.render({ ...WALKER, state: 'move', direction: 1, frame });
    const stand = service.render({ ...WALKER, state: 'stand', direction: 1 });

    // 왼발 - 서기 - 오른발 - 서기 순서로 돌고 다섯 번째에 처음으로 돌아온다.
    expect(pose(0).equals(stand)).toBe(false);
    expect(pose(1).equals(stand)).toBe(true);
    expect(pose(2).equals(stand)).toBe(false);
    expect(pose(3).equals(stand)).toBe(true);
    expect(pose(0).equals(pose(2))).toBe(false);
    expect(pose(0).equals(pose(4))).toBe(true);
  });

  /*
   * 머리 리소스에는 액션 149번까지만 있어 감정표현 12~15는 머리가 통째로 빠져 있었다.
   * 14번은 서기와 같은 갑옷 프레임을 쓰므로, 머리를 제대로 빌려 왔다면 서기와 그림이 같아야 한다.
   */
  it('keeps the head on emotes that reuse an earlier action', () => {
    for (const direction of [1, 2, 4, 8]) {
      const stand = service.render({ ...WALKER, state: 'stand', direction });
      const emote = service.render({
        ...WALKER,
        state: 'emote',
        emote: 14,
        direction,
      });

      expect(emote.equals(stand)).toBe(true);
    }
  });

  it('renders one dye list in a single response', () => {
    const list = service.getDyeList('head', {
      head: 0,
      body: 20,
      weapon: -1,
      shield: -1,
    });

    expect(list.item).toBe(0);
    expect(list.dyes).toHaveLength(32);
    expect(list.width).toBeGreaterThan(0);
    // 칸마다 캐릭터가 같은 자리에 서도록 크기를 하나로 맞춰 보낸다.
    for (const entry of list.dyes) {
      const png = PNG.sync.read(Buffer.from(entry.image, 'base64'));
      expect([png.width, png.height]).toEqual([list.width, list.height]);
    }
  });

  it('returns an empty dye list for an empty slot', () => {
    expect(service.getDyeList('weapon', { weapon: -1 }).dyes).toEqual([]);
  });

  it('rejects unknown part ids', () => {
    expect(() => service.render({ head: 999_999 })).toThrow(
      'head 999999번 아이템이 없습니다.',
    );
  });
});
