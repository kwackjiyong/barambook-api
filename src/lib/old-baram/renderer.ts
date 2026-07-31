import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import {
  ACTION_ALIASES,
  DIRECTIONS,
  DRAW_ORDERS,
  MOVE_POSES,
  PART_BODY,
  PART_HEAD,
  PART_SHIELD,
  PART_WEAPON,
  STATES,
  resolveActionId,
  type OldBaramState,
  weaponPartOf,
  weaponTypeOf,
} from './actions';
import { EpfImage, type OldBaramPalette, type PixelSurface } from './epf-image';
import { stampWatermark } from './watermark';
import {
  readAnim,
  readMeta,
  readObp,
  readPal,
  readShadowTable,
  readTbl,
  requireSection,
  resolveDraw,
  resourceIdOf,
  type DrawEntry,
  type OldBaramMeta,
  type OldBaramTable,
  type ShadowEntry,
} from './format';

const PART_KEYS = ['head', 'body', 'sword', 'shield', 'spear', 'fan'] as const;
type PartKey = (typeof PART_KEYS)[number];

/** 선택 목록에서 부위를 고를 때 쓰는 이름. 무기는 검·창·부채를 한 칸으로 묶는다. */
export const SLOT_KEYS = ['head', 'body', 'weapon', 'shield'] as const;
export type OldBaramSlotKey = (typeof SLOT_KEYS)[number];

export interface OldBaramRenderRequest {
  head?: number;
  headDye?: number;
  body?: number;
  bodyDye?: number;
  weapon?: number;
  weaponDye?: number;
  shield?: number;
  shieldDye?: number;
  state?: OldBaramState;
  direction?: number;
  frame?: number;
  emote?: number;
  colorFrame?: number;
  shadow?: boolean;
  zoom?: number;
  /**
   * 캔버스를 이 범위로 고정한다. 여러 조합을 한 판에 늘어놓는 썸네일 시트처럼
   * 그림마다 크기가 달라지면 안 되는 곳에서 쓴다. 없으면 착용 조합에 맞춰 잡는다.
   */
  canvas?: FrameWindow;
}

interface NormalizedRequest {
  head: number;
  headDye: number;
  body: number;
  bodyDye: number;
  weapon: number;
  weaponDye: number;
  shield: number;
  shieldDye: number;
  state: OldBaramState;
  direction: number;
  frame: number;
  emote: number;
  colorFrame: number;
  shadow: boolean;
  zoom: number;
  canvas: FrameWindow | null;
}

/** 모든 프레임을 담을 수 있는 고정 캔버스 범위(스프라이트 앵커 기준 좌표) */
export interface FrameWindow {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LoadedPack {
  filePath: string;
  byteLength: number;
  frameWindow: FrameWindow;
  palettes: OldBaramPalette[];
  table: OldBaramTable;
  shadowTables: Array<Array<ShadowEntry | null>>;
  animation: ReturnType<typeof readAnim>;
  meta: OldBaramMeta;
  shadowEpf: EpfImage;
  epf: Record<PartKey, EpfImage>;
}

interface PartResource {
  partKey: PartKey;
  itemId: number;
  dye: number;
  actions: Map<number, DrawEntry>;
}

interface DrawLayer {
  partKey: PartKey;
  frame: number;
  palette: OldBaramPalette;
  dye: number;
}

class RgbaSurface implements PixelSurface {
  readonly rgba: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.rgba = new Uint8ClampedArray(width * height * 4);
  }

  setPixel(
    x: number,
    y: number,
    red: number,
    green: number,
    blue: number,
    alpha = 255,
  ): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (y * this.width + x) * 4;
    const sourceAlpha = alpha / 255;
    const destinationAlpha = (this.rgba[offset + 3] / 255) * (1 - sourceAlpha);
    const outputAlpha = sourceAlpha + destinationAlpha;
    if (outputAlpha <= 0) return;
    this.rgba[offset] = Math.round(
      (red * sourceAlpha + this.rgba[offset] * destinationAlpha) / outputAlpha,
    );
    this.rgba[offset + 1] = Math.round(
      (green * sourceAlpha +
        this.rgba[offset + 1] * destinationAlpha) /
        outputAlpha,
    );
    this.rgba[offset + 2] = Math.round(
      (blue * sourceAlpha +
        this.rgba[offset + 2] * destinationAlpha) /
        outputAlpha,
    );
    this.rgba[offset + 3] = Math.round(outputAlpha * 255);
  }
}

function findPackPath(): string {
  const configured = process.env.OLD_BARAM_OBP_PATH;
  const candidates = [
    configured ? path.resolve(configured) : null,
    path.resolve(process.cwd(), 'src', 'assets', 'dat', 'old-baram.obp'),
    path.resolve(process.cwd(), 'dist', 'assets', 'dat', 'old-baram.obp'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `old-baram.obp을 찾을 수 없습니다. 확인한 경로: ${candidates.join(', ')}`,
  );
}

function frameCountFor(state: OldBaramState, emote: number): number {
  if (state === 'move') return MOVE_POSES.length;
  if (state === 'attack') return 2;
  if (state === 'emote' && emote === 11) return 4;
  return 1;
}

function encodePng(surface: RgbaSurface): Buffer {
  const png = new PNG({ width: surface.width, height: surface.height });
  png.data = Buffer.from(surface.rgba);
  return PNG.sync.write(png);
}

function scaleNearest(source: RgbaSurface, zoom: number): RgbaSurface {
  if (zoom === 1) return source;
  const target = new RgbaSurface(source.width * zoom, source.height * zoom);
  for (let y = 0; y < target.height; y += 1) {
    const sourceY = Math.floor(y / zoom);
    for (let x = 0; x < target.width; x += 1) {
      const sourceX = Math.floor(x / zoom);
      const from = (sourceY * source.width + sourceX) * 4;
      const to = (y * target.width + x) * 4;
      target.rgba[to] = source.rgba[from];
      target.rgba[to + 1] = source.rgba[from + 1];
      target.rgba[to + 2] = source.rgba[from + 2];
      target.rgba[to + 3] = source.rgba[from + 3];
    }
  }
  return target;
}

/**
 * 모든 EPF 프레임을 덮는 최대 사각형.
 * 포즈마다 잘라내면 이미지 크기가 달라져 캐릭터가 흔들리므로,
 * 모든 동작이 같은 좌표계 안에 들어가도록 캔버스를 이 크기로 고정한다.
 */
function measureFrameWindow(images: EpfImage[]): FrameWindow {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const image of images) {
    for (const item of image.items) {
      if (item.right - item.left <= 0 || item.bottom - item.top <= 0) continue;
      if (item.left < left) left = item.left;
      if (item.top < top) top = item.top;
      if (item.right > right) right = item.right;
      if (item.bottom > bottom) bottom = item.bottom;
    }
  }

  if (!Number.isFinite(left)) {
    throw new Error('EPF 프레임이 하나도 없어 캔버스 크기를 정할 수 없습니다.');
  }

  return { left, top, width: right - left, height: bottom - top };
}

/**
 * 확대 상한.
 * 의상실이 미리보기 높이를 340px로 묶어 두어 이보다 키워도 화면에서는 다시 줄어든다.
 * 보이지도 않는 큰 그림을 만들 이유가 없다.
 */
const MAX_ZOOM = 4;

/**
 * 화면에서 고를 수 있는 감정표현.
 *
 * 15번은 갑옷 스프라이트가 12번과 완전히 같고(원본 테이블에서 둘 다 같은 그림을 가리킨다),
 * 둘을 갈라 줄 머리가 원본 리소스에 없다. 머리 테이블은 3264개 리소스 전부가
 * 액션 149번까지뿐이라 감정표현 12~15 자리에는 얼굴이 아예 들어 있지 않다.
 * 그래서 15번은 12번과 똑같이 그려지므로 목록에서 뺀다.
 * 렌더 자체는 막지 않아 예전에 만들어진 주소는 그대로 열린다.
 */
const SELECTABLE_EMOTES = Array.from({ length: 15 }, (_, id) => id);

/** 확대까지 반영한 최종 PNG 크기. 워터마크는 그림 위에 겹치므로 크기를 늘리지 않는다. */
function outputSizeOf(canvas: FrameWindow, zoom: number) {
  return { width: canvas.width * zoom, height: canvas.height * zoom };
}

function weaponOffset(partKey: 'sword' | 'spear' | 'fan'): number {
  if (partKey === 'spear') return 10000;
  if (partKey === 'fan') return 30000;
  return 0;
}

export class OldBaramRenderer {
  private pack: LoadedPack | null = null;
  private readonly pngCache = new Map<string, Buffer>();
  private readonly windowCache = new Map<string, FrameWindow>();

  load(): void {
    if (this.pack) return;
    const filePath = findPackPath();
    const bytes = new Uint8Array(fs.readFileSync(filePath));
    const sections = readObp(bytes);
    const epf = {} as Record<PartKey, EpfImage>;
    for (const partKey of PART_KEYS) {
      epf[partKey] = new EpfImage(
        requireSection(sections, `epf/${partKey}`),
      );
    }
    const shadowEpf = new EpfImage(requireSection(sections, 'epf/shadow'));
    this.pack = {
      filePath,
      byteLength: bytes.byteLength,
      frameWindow: measureFrameWindow([
        ...PART_KEYS.map((partKey) => epf[partKey]),
        shadowEpf,
      ]),
      palettes: readPal(requireSection(sections, 'pal')),
      table: readTbl(requireSection(sections, 'tbl')),
      shadowTables: readShadowTable(requireSection(sections, 'shadow')),
      animation: readAnim(requireSection(sections, 'anim')),
      meta: readMeta(requireSection(sections, 'meta')),
      shadowEpf,
      epf,
    };
  }

  getOptions() {
    const pack = this.requirePack();
    const items = (partKey: PartKey) =>
      (pack.meta.parts[partKey]?.items ?? []).map((item) => ({
        id: item.id,
        dyes: item.dyes,
      }));
    const weapons = (
      [
        ['sword', 0],
        ['spear', 10000],
        ['fan', 30000],
      ] as const
    )
      .flatMap(([partKey, offset]) =>
        items(partKey).map((item) => ({
          id: item.id + offset,
          part: partKey,
          rawId: item.id,
          dyes: item.dyes,
        })),
      )
      .sort((left, right) => left.id - right.id);

    return {
      pack: {
        byteLength: pack.byteLength,
        frameCount: PART_KEYS.reduce(
          (sum, partKey) => sum + pack.epf[partKey].items.length,
          0,
        ),
        paletteCount: pack.palettes.length,
      },
      parts: {
        head: items('head'),
        body: items('body'),
        weapon: weapons,
        shield: items('shield'),
      },
      states: STATES,
      directions: DIRECTIONS,
      emotes: SELECTABLE_EMOTES,
      limits: { zoom: [1, MAX_ZOOM], colorFrame: [0, 7] },
      /*
       * 실제 캔버스는 착용 조합에 맞춰 좁혀지므로 이 값은 상한이다.
       * PNG 최대 크기는 (width * zoom) x (height * zoom).
       * 미리보기 영역을 미리 잡아 둘 때 쓴다.
       */
      maxCanvas: {
        width: pack.frameWindow.width,
        height: pack.frameWindow.height,
      },
    };
  }

  render(request: OldBaramRenderRequest): Buffer {
    const pack = this.requirePack();
    const params = this.normalize(request);
    const cacheKey = JSON.stringify(params);
    const cached = this.pngCache.get(cacheKey);
    if (cached) return cached;

    const { resources, layers, shadowTable, shadow } = this.plan(params);

    const hasShadowFrame = Boolean(
      shadow && pack.shadowEpf.getBounds(shadow.frame),
    );
    const hasPartFrame = layers.some((layer) =>
      pack.epf[layer.partKey].getBounds(layer.frame),
    );
    if (!hasShadowFrame && !hasPartFrame) {
      throw new RangeError('표시 가능한 캐릭터 조각이 없습니다.');
    }

    /*
     * EPF 프레임은 이미 공통 앵커 기준의 절대좌표를 가지고 있다.
     * 포즈별 경계로 잘라내면 프레임마다 이미지 크기와 캐릭터 위치가 달라져
     * 동작 재생 중 캐릭터가 상하좌우로 흔들린다.
     * 그래서 이 착용 조합이 만들 수 있는 모든 프레임을 덮는 캔버스에
     * 늘 같은 원점으로 그린다. 동작/방향/프레임이 바뀌어도 크기가 고정된다.
     */
    const frameWindow =
      params.canvas ?? this.frameWindowFor(params, resources, shadowTable);
    const originX = -frameWindow.left;
    const originY = -frameWindow.top;
    const surface = new RgbaSurface(frameWindow.width, frameWindow.height);

    if (shadow) {
      pack.shadowEpf.draw(
        surface,
        originX,
        originY,
        shadow.frame,
        0,
        pack.palettes[shadow.palette],
        64,
      );
    }
    for (const layer of layers) {
      pack.epf[layer.partKey].draw(
        surface,
        originX,
        originY,
        layer.frame,
        layer.dye,
        layer.palette,
      );
    }

    const scaled = scaleNearest(surface, params.zoom);
    stampWatermark(scaled);
    const png = encodePng(scaled);
    this.pngCache.set(cacheKey, png);
    if (this.pngCache.size > 512) {
      const oldest = this.pngCache.keys().next().value as string | undefined;
      if (oldest) this.pngCache.delete(oldest);
    }
    return png;
  }

  /**
   * 크기를 하나로 맞춘 PNG 여러 장.
   * 염색 목록이나 부위 썸네일 시트처럼 칸마다 캐릭터가 같은 자리에 서야 하는 곳에 쓴다.
   */
  renderSheet(requests: OldBaramRenderRequest[]): {
    /** 워터마크 띠까지 포함한 PNG 한 장의 크기. 모든 장이 이 크기다. */
    width: number;
    height: number;
    images: Buffer[];
  } {
    const canvas = this.measureCanvas(requests);
    const zoom = this.normalize(requests[0] ?? {}).zoom;

    return {
      ...outputSizeOf(canvas, zoom),
      images: requests.map((request) => this.render({ ...request, canvas })),
    };
  }

  /** 요청들이 실제로 그리는 조각만 덮는 최소 캔버스. */
  measureCanvas(requests: OldBaramRenderRequest[]): FrameWindow {
    const pack = this.requirePack();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const include = (image: EpfImage, frame: number) => {
      const bounds = image.getBounds(frame);
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      if (bounds.left < left) left = bounds.left;
      if (bounds.top < top) top = bounds.top;
      if (bounds.right > right) right = bounds.right;
      if (bounds.bottom > bottom) bottom = bounds.bottom;
    };

    for (const request of requests) {
      const { layers, shadow } = this.plan(this.normalize(request));
      for (const layer of layers) include(pack.epf[layer.partKey], layer.frame);
      if (shadow) include(pack.shadowEpf, shadow.frame);
    }

    return Number.isFinite(left)
      ? { left, top, width: right - left, height: bottom - top }
      : pack.frameWindow;
  }

  /**
   * 한 부위가 가진 염색을 전부 같은 크기의 썸네일로 그린다.
   * 염색 하나에 한 번씩 왕복하지 않도록 선택 목록을 한 응답으로 내려보내기 위한 것이라
   * 자세는 서기로 고정하고 그림자는 뺀다.
   */
  renderDyeSheet(
    slot: OldBaramSlotKey,
    request: OldBaramRenderRequest,
  ): {
    item: number;
    dyes: number[];
    width: number;
    height: number;
    images: Buffer[];
  } {
    const item = this.normalize(request)[slot];
    const dyes = item === -1 ? [] : this.dyesOf(slot, item);
    if (dyes.length === 0) {
      return { item, dyes, width: 0, height: 0, images: [] };
    }

    return {
      item,
      dyes,
      ...this.renderSheet(
        dyes.map((dye) => ({
          ...request,
          [`${slot}Dye`]: dye,
          state: 'stand' as const,
          frame: 0,
          colorFrame: 0,
          shadow: false,
        })),
      ),
    };
  }

  /** 부위 한 칸이 지원하는 염색 번호. 없는 아이템이면 빈 배열. */
  dyesOf(slot: OldBaramSlotKey, itemId: number): number[] {
    if (slot === 'weapon') {
      const partKey = weaponPartOf(itemId);
      if (!partKey) return [];
      return this.dyesOfPart(partKey, itemId - weaponOffset(partKey));
    }
    return this.dyesOfPart(slot, itemId);
  }

  private dyesOfPart(partKey: PartKey, itemId: number): number[] {
    const part = this.requirePack().meta.parts[partKey];
    return part?.items.find((item) => item.id === itemId)?.dyes ?? [];
  }

  private requirePack(): LoadedPack {
    this.load();
    return this.pack as LoadedPack;
  }

  /** 한 요청이 어떤 액션의 어떤 조각들을 어떤 순서로 그리는지 정한다. */
  private plan(params: NormalizedRequest): {
    actionId: number;
    resources: Record<number, PartResource | null>;
    layers: DrawLayer[];
    shadowTable: Array<ShadowEntry | null> | null;
    shadow: ShadowEntry | null;
  } {
    const pack = this.requirePack();
    const actionId = resolveActionId({
      state: params.state,
      weaponType: weaponTypeOf(params.weapon),
      direction: params.direction,
      frame: params.frame % frameCountFor(params.state, params.emote),
      emote: params.emote,
    });
    if (actionId === undefined) {
      throw new RangeError('해당 조합의 동작 프레임이 없습니다.');
    }

    const resources: Record<number, PartResource | null> = {
      [PART_HEAD]: this.partResource('head', params.head, params.headDye),
      [PART_BODY]: this.partResource('body', params.body, params.bodyDye),
      [PART_WEAPON]: this.weaponResource(params.weapon, params.weaponDye),
      [PART_SHIELD]:
        params.shield === -1
          ? null
          : this.partResource('shield', params.shield, params.shieldDye),
    };

    const layers: DrawLayer[] = [];
    const drawOrder = DRAW_ORDERS[actionId] ?? {};
    for (let slot = 4; slot >= 1; slot -= 1) {
      const partSlot = drawOrder[slot];
      if (!partSlot) continue;
      const resource = resources[partSlot];
      if (!resource) continue;
      // 이 부위에 없는 액션이면 같은 자세를 담고 있는 액션으로 대신한다.
      const partActionId = resource.actions.has(actionId)
        ? actionId
        : (ACTION_ALIASES[actionId] ?? actionId);
      const picked = resolveDraw(
        resource.actions.get(partActionId),
        pack.palettes,
        resource.dye,
        params.colorFrame,
        pack.animation.get(
          `${resource.partKey}:${resource.itemId}:${partActionId}:${resource.dye}`,
        ),
      );
      if (picked) layers.push({ partKey: resource.partKey, ...picked });
    }

    const bodyResourceId = resourceIdOf(
      pack.meta.parts.body.base,
      params.body,
      params.bodyDye,
    );
    const shadowTable = params.shadow
      ? (pack.shadowTables[
          pack.meta.bodyShadowChoice?.[bodyResourceId] === 2 ? 1 : 0
        ] ?? null)
      : null;

    return {
      actionId,
      resources,
      layers,
      shadowTable,
      shadow: shadowTable?.[actionId] ?? null,
    };
  }

  /**
   * 이 착용 조합이 만들 수 있는 모든 프레임을 덮는 캔버스 범위.
   * 동작·방향·프레임이 아니라 착용값에만 의존하므로 애니메이션 중에는 크기가 변하지 않고,
   * 전체 프레임 기준 최대 크기보다 훨씬 좁아 캐릭터가 여백에 묻히지 않는다.
   */
  private frameWindowFor(
    params: NormalizedRequest,
    resources: Record<number, PartResource | null>,
    shadowTable: Array<ShadowEntry | null> | null,
  ): FrameWindow {
    const pack = this.requirePack();
    const cacheKey = [
      params.head,
      params.headDye,
      params.body,
      params.bodyDye,
      params.weapon,
      params.weaponDye,
      params.shield,
      params.shieldDye,
      shadowTable ? 1 : 0,
    ].join(':');
    const cached = this.windowCache.get(cacheKey);
    if (cached) return cached;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const include = (image: EpfImage, frame: number) => {
      const bounds = image.getBounds(frame);
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      if (bounds.left < left) left = bounds.left;
      if (bounds.top < top) top = bounds.top;
      if (bounds.right > right) right = bounds.right;
      if (bounds.bottom > bottom) bottom = bounds.bottom;
    };

    for (const resource of Object.values(resources)) {
      if (!resource) continue;
      const image = pack.epf[resource.partKey];
      for (const [actionId, entry] of resource.actions) {
        const frame = entry.perDye
          ? (entry.perDye[resource.dye] ?? entry.perDye[0])
          : entry.frame;
        if (frame !== undefined) include(image, frame);
        // 반짝임 단계에서 프레임 자체가 교체되는 아이템도 있다.
        const animation = pack.animation.get(
          `${resource.partKey}:${resource.itemId}:${actionId}:${resource.dye}`,
        );
        for (const step of animation?.frames ?? []) include(image, step.frame);
      }
    }
    if (shadowTable) {
      for (const entry of shadowTable) {
        if (entry) include(pack.shadowEpf, entry.frame);
      }
    }

    const frameWindow: FrameWindow = Number.isFinite(left)
      ? { left, top, width: right - left, height: bottom - top }
      : pack.frameWindow;

    this.windowCache.set(cacheKey, frameWindow);
    if (this.windowCache.size > 256) {
      const oldest = this.windowCache.keys().next().value;
      if (oldest) this.windowCache.delete(oldest);
    }
    return frameWindow;
  }

  private normalize(request: OldBaramRenderRequest): NormalizedRequest {
    const pack = this.requirePack();
    const firstId = (partKey: PartKey, fallback: number) =>
      pack.meta.parts[partKey]?.items[0]?.id ?? fallback;
    const normalized: NormalizedRequest = {
      head: request.head ?? firstId('head', 0),
      headDye: request.headDye ?? 0,
      body: request.body ?? firstId('body', 0),
      bodyDye: request.bodyDye ?? 0,
      weapon: request.weapon ?? -1,
      weaponDye: request.weaponDye ?? 0,
      shield: request.shield ?? -1,
      shieldDye: request.shieldDye ?? 0,
      state: request.state ?? 'stand',
      direction: request.direction ?? 1,
      frame: request.frame ?? 0,
      emote: request.emote ?? 0,
      colorFrame: request.colorFrame ?? 0,
      shadow: request.shadow ?? true,
      zoom: request.zoom ?? 4,
      canvas: request.canvas ?? null,
    };

    if (!STATES.some((state) => state.key === normalized.state)) {
      throw new RangeError(`지원하지 않는 state입니다: ${normalized.state}`);
    }
    if (!DIRECTIONS.some(({ code }) => code === normalized.direction)) {
      throw new RangeError(
        `direction은 1, 2, 4, 8 중 하나여야 합니다: ${normalized.direction}`,
      );
    }
    const integerFields: Array<[string, number]> = [
      ['head', normalized.head],
      ['headDye', normalized.headDye],
      ['body', normalized.body],
      ['bodyDye', normalized.bodyDye],
      ['weapon', normalized.weapon],
      ['weaponDye', normalized.weaponDye],
      ['shield', normalized.shield],
      ['shieldDye', normalized.shieldDye],
      ['direction', normalized.direction],
      ['frame', normalized.frame],
      ['emote', normalized.emote],
      ['colorFrame', normalized.colorFrame],
      ['zoom', normalized.zoom],
    ];
    for (const [name, value] of integerFields) {
      if (!Number.isSafeInteger(value)) {
        throw new RangeError(`${name}은 정수여야 합니다.`);
      }
    }
    if (normalized.frame < 0) throw new RangeError('frame은 0 이상이어야 합니다.');
    if (normalized.emote < 0 || normalized.emote > 15) {
      throw new RangeError('emote는 0~15여야 합니다.');
    }
    if (normalized.colorFrame < 0 || normalized.colorFrame > 7) {
      throw new RangeError('colorFrame은 0~7이어야 합니다.');
    }
    if (normalized.zoom < 1 || normalized.zoom > MAX_ZOOM) {
      throw new RangeError(`zoom은 1~${MAX_ZOOM}이어야 합니다.`);
    }

    this.assertItem('head', normalized.head, normalized.headDye);
    this.assertItem('body', normalized.body, normalized.bodyDye);
    if (normalized.shield !== -1) {
      this.assertItem('shield', normalized.shield, normalized.shieldDye);
    }
    if (normalized.weapon !== -1) {
      const partKey = weaponPartOf(normalized.weapon);
      if (!partKey) throw new RangeError(`지원하지 않는 무기 ID입니다.`);
      this.assertItem(
        partKey,
        normalized.weapon - weaponOffset(partKey),
        normalized.weaponDye,
      );
    }
    return normalized;
  }

  private assertItem(partKey: PartKey, itemId: number, dye: number): void {
    const part = this.requirePack().meta.parts[partKey];
    const item = part?.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      throw new RangeError(`${partKey} ${itemId}번 아이템이 없습니다.`);
    }
    if (!item.dyes.includes(dye)) {
      throw new RangeError(
        `${partKey} ${itemId}번에 염색 ${dye}가 없습니다.`,
      );
    }
  }

  private partResource(
    partKey: PartKey,
    itemId: number,
    dye: number,
  ): PartResource | null {
    const actions = this.requirePack().table.get(partKey)?.get(itemId);
    return actions ? { partKey, itemId, dye, actions } : null;
  }

  private weaponResource(weaponId: number, dye: number): PartResource | null {
    const partKey = weaponPartOf(weaponId);
    if (!partKey) return null;
    return this.partResource(
      partKey,
      weaponId - weaponOffset(partKey),
      dye,
    );
  }
}
