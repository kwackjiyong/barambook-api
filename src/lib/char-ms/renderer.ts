import type { DecodedBitmap, RenderParams } from '../types';
import type {
  CharMsAssets,
  CharMsAtlasAssets,
  CharMsAtlasPixels,
} from './assets';
import {
  compareCharMsCompositeLayersBackToFront,
  resolveCharMsAction,
  resolveCharMsItemFrame,
  type CharMsActionToken,
  type CharMsFrame,
  type CharMsLogicalPart,
} from './format';
import { resolveCharMsPose, type CharMsPose } from './frames';

export type CharMsHeadMode = 'head' | 'face-hair';

/** 고전 렌더러가 알고 있는 4개 부위. char-ms가 못 그리면 여기로 폴백한다. */
export type LegacyPart = 'head' | 'body' | 'weapon' | 'shield';

export interface CharMsAppearance {
  headMode: CharMsHeadMode;
  head: number;
  headc: number;
  hair: number;
  hairc: number;
  face: number;
  body: number;
  bodyc: number;
  /** 갑옷 염색약 dyeId. 0이면 기본 컬러(bodyc)를 쓴다. */
  bodyDye: number;
  weapon: number;
  weaponc: number;
  /** 무기 염색약 dyeId. 0이면 기본 컬러(weaponc)를 쓴다. */
  weaponDye: number;
  shield: number;
  shieldc: number;
  riding: number;
  skinc: number;
}

export interface CharMsLayer {
  logicalPart: CharMsLogicalPart;
  legacyPart: LegacyPart | null;
  token: CharMsActionToken;
  partOrder: number;
  bitmap: DecodedBitmap;
}

export interface CharMsRenderResult {
  pose: CharMsPose;
  layers: CharMsLayer[];
  /** char-ms가 실제로 그린 고전 부위. 나머지는 호출 측이 EPF로 채운다. */
  covered: Set<LegacyPart>;
  /**
   * 이 자세에서 메월 데이터가 일부러 그리지 않는 부위(예: 기승 자세의 무기·방패).
   * EPF로도 그리면 안 되므로 폴백에서 함께 빼야 한다.
   */
  hidden: Set<LegacyPart>;
  /** 같은 layer끼리의 타이브레이커로 쓸 drworder.tbl 순서 문자열. */
  classicOrder: string;
  /** 폴백 부위를 끼워 넣을 때 쓸 부위별 z-order 슬롯. */
  layerSlotByPart: Map<LegacyPart, number>;
}

interface PartPlan {
  logicalPart: CharMsLogicalPart;
  legacyPart: LegacyPart | null;
  itemId: string;
  colorIndex: number;
  /** 메월 염색약 dyeId. 0이면 기본 컬러 규칙을 쓴다. */
  dyeId: number;
  /** 색상값 255 이상은 바람비전 전용 염색 팔레트라 char-ms에 대응 데이터가 없다. */
  supported: boolean;
}

/** 렌더 파라미터를 메월 렌더러가 쓰는 외형 값으로 옮긴다. */
export function toCharMsAppearance(params: RenderParams): CharMsAppearance {
  return {
    headMode: params.headMode ?? 'head',
    head: params.head | 0,
    headc: params.headc | 0,
    hair: params.hair ?? -1,
    hairc: params.hairc ?? 0,
    face: params.face ?? -1,
    body: params.body | 0,
    bodyc: params.bodyc | 0,
    bodyDye: params.bodyDye ?? 0,
    weapon: params.weapon | 0,
    weaponc: params.weaponc | 0,
    weaponDye: params.weaponDye ?? 0,
    shield: params.shield | 0,
    shieldc: params.shieldc | 0,
    riding: params.riding ?? 0,
    skinc: params.skinc ?? 0,
  };
}

/** 부위 순서. z-order 동률일 때의 안정적인 타이브레이커로도 쓴다. */
const PART_ORDER: CharMsLogicalPart[] = [
  'riding',
  'weapon',
  'armor',
  'head',
  'face',
  'hair',
  'shield',
];

const SPEAR_STANCE = /^(stand|walk|attack)\.spear$/;

function buildPartPlans(appearance: CharMsAppearance): PartPlan[] {
  const plans: PartPlan[] = [];

  if (appearance.riding >= 0) {
    plans.push({
      logicalPart: 'riding',
      legacyPart: null,
      itemId: String(appearance.riding),
      colorIndex: 0,
      dyeId: 0,
      supported: true,
    });
  }

  if (appearance.weapon >= 0) {
    plans.push({
      logicalPart: 'weapon',
      legacyPart: 'weapon',
      itemId: String(appearance.weapon),
      colorIndex: appearance.weaponc,
      dyeId: appearance.weaponDye,
      supported: appearance.weaponc < 255,
    });
  }

  plans.push({
    logicalPart: 'armor',
    legacyPart: 'body',
    itemId: String(appearance.body),
    colorIndex: appearance.bodyc,
    dyeId: appearance.bodyDye,
    supported: appearance.bodyc < 255,
  });

  if (appearance.headMode === 'face-hair') {
    if (appearance.face >= 0) {
      plans.push({
        logicalPart: 'face',
        legacyPart: null,
        itemId: String(appearance.face),
        colorIndex: 0,
        dyeId: 0,
        supported: true,
      });
    }

    if (appearance.hair >= 0) {
      plans.push({
        logicalPart: 'hair',
        legacyPart: null,
        itemId: String(appearance.hair),
        colorIndex: appearance.hairc,
        dyeId: 0,
        supported: true,
      });
    }
  } else {
    plans.push({
      logicalPart: 'head',
      legacyPart: 'head',
      itemId: String(appearance.head),
      colorIndex: appearance.headc,
      dyeId: 0,
      supported: appearance.headc < 255,
    });
  }

  if (appearance.shield >= 0) {
    plans.push({
      logicalPart: 'shield',
      legacyPart: 'shield',
      itemId: String(appearance.shield),
      colorIndex: appearance.shieldc,
      dyeId: 0,
      supported: appearance.shieldc < 255,
    });
  }

  return plans;
}

/**
 * 어떤 고전 부위를 char-ms로 그릴 수 있는지 미리 알려 준다.
 * 자산을 실제로 래스터화하지 않으므로 68MB짜리 EPF를 받을지 판단하는 데 쓴다.
 */
export function resolveCharMsCoverage(
  assets: CharMsAssets,
  appearance: CharMsAppearance,
) {
  const covered = new Set<LegacyPart>();

  for (const plan of buildPartPlans(appearance)) {
    if (
      plan.legacyPart &&
      plan.supported &&
      findAtlasForItem(assets, plan.logicalPart, plan.itemId)
    ) {
      covered.add(plan.legacyPart);
    }
  }

  return covered;
}

/** char-ms가 그리는 부위들의 팔레트 애니메이션 주기(색상순환 염색 등). */
export function resolveCharMsColorPeriod(
  assets: CharMsAssets,
  appearance: CharMsAppearance,
  cap = 32,
) {
  if (!assets.palettes) {
    return 1;
  }

  let period = 1;

  for (const plan of buildPartPlans(appearance)) {
    if (!plan.supported) {
      continue;
    }

    const atlas = findAtlasForItem(assets, plan.logicalPart, plan.itemId);

    if (!atlas?.palette) {
      continue;
    }

    period = lcm(
      period,
      assets.palettes.paletteFrameCount(atlas.palette, plan.itemId, plan.dyeId),
    );

    if (period >= cap) {
      return cap;
    }
  }

  return period;
}

function greatestCommonDivisor(first: number, second: number): number {
  return second === 0 ? first : greatestCommonDivisor(second, first % second);
}

function lcm(first: number, second: number) {
  const safeFirst = Math.max(1, first | 0);
  const safeSecond = Math.max(1, second | 0);

  return (
    (safeFirst / greatestCommonDivisor(safeFirst, safeSecond)) * safeSecond
  );
}

/**
 * 방패는 메월 데이터상 창 자세(`*.spear`)에 동작이 없다. 바람비전은 예전부터
 * 창을 들어도 방패를 그렸으므로, 창 자세에서는 한손 자세 프레임을 그대로 쓴다.
 * (고전 shield EPF도 창 프레임을 `frame - 32`로 같은 로컬 인덱스에서 읽는다.)
 */
function resolveActionForPart(
  atlas: CharMsAtlasAssets,
  state: string,
  direction: number,
) {
  const action = resolveCharMsAction(atlas, state, direction);

  if (
    action?.frames.length ||
    atlas.logicalPart !== 'shield' ||
    !SPEAR_STANCE.test(state)
  ) {
    return action;
  }

  const baseState = state.slice(0, state.indexOf('.'));
  const fallback = atlas.getAction(baseState, direction);
  return fallback?.frames.length ? fallback : null;
}

function findAtlasForItem(
  assets: CharMsAssets,
  logicalPart: CharMsLogicalPart,
  itemId: string,
) {
  return atlasesForItem(assets, logicalPart, itemId)[0] ?? null;
}

/**
 * 한 아이템의 프레임이 여러 아틀라스에 쪼개져 있을 수 있다.
 * 예를 들어 갑옷 151(적혼요령의)은 worldFrame 1~29·33~44가 `armor`에,
 * 30~32·45~104가 `armor2`에 들어 있다. 그래서 아틀라스 하나만 붙잡으면
 * 특정 방향·자세에서 갑옷이 통째로 사라진다.
 */
function atlasesForItem(
  assets: CharMsAssets,
  logicalPart: CharMsLogicalPart,
  itemId: string,
) {
  return (assets.atlasesByLogicalPart.get(logicalPart) ?? []).filter((atlas) =>
    atlas.itemById.has(itemId),
  );
}

function buildColorLut(
  assets: CharMsAssets,
  atlas: CharMsAtlasAssets,
  itemId: string,
  colorIndex: number,
  dyeId: number,
  animationFrame: number,
) {
  const dataset = atlas.palette;

  if (!dataset || !assets.palettes) {
    return null;
  }

  return assets.palettes.buildColorLut(
    dataset,
    itemId,
    dyeId,
    colorIndex,
    animationFrame,
  );
}

function rasterize(
  pixels: CharMsAtlasPixels,
  frame: CharMsFrame,
  lut: Uint8Array | null,
  transparentIndex: number,
): DecodedBitmap {
  const { width, height } = frame;
  const rgba = new Uint8ClampedArray(Math.max(0, width * height * 4));
  const bitmap: DecodedBitmap = {
    w: width,
    h: height,
    left: frame.drawX,
    top: frame.drawY,
    rgba,
  };

  if (width <= 0 || height <= 0) {
    return bitmap;
  }

  if (pixels.indexed && pixels.indices && lut) {
    const { indices } = pixels;

    for (let row = 0; row < height; row += 1) {
      const sourceRow = (frame.sourceY + row) * pixels.width + frame.sourceX;
      const targetRow = row * width;

      for (let column = 0; column < width; column += 1) {
        const index = indices[sourceRow + column];

        if (index === 0 || index === transparentIndex) {
          continue;
        }

        const source = index * 3;
        const target = (targetRow + column) * 4;
        rgba[target] = lut[source];
        rgba[target + 1] = lut[source + 1];
        rgba[target + 2] = lut[source + 2];
        rgba[target + 3] = 255;
      }
    }

    return bitmap;
  }

  if (!pixels.indexed && pixels.rgba) {
    const source = pixels.rgba;

    for (let row = 0; row < height; row += 1) {
      const sourceRow =
        ((frame.sourceY + row) * pixels.width + frame.sourceX) * 4;
      const targetRow = row * width * 4;

      for (let column = 0; column < width; column += 1) {
        const from = sourceRow + column * 4;

        if (source[from + 3] === 0) {
          continue;
        }

        const target = targetRow + column * 4;
        rgba[target] = source[from];
        rgba[target + 1] = source[from + 1];
        rgba[target + 2] = source[from + 2];
        rgba[target + 3] = source[from + 3];
      }
    }
  }

  return bitmap;
}

/**
 * 선택한 외형을 메월 데이터로 그린다. char-ms에 아이템이 없거나 바람비전 전용
 * 염색을 쓴 부위는 결과에 포함하지 않고 `covered`에서 빠지므로, 호출 측이 기존
 * EPF 렌더러로 채워 넣으면 된다.
 */
export function renderCharMsLayers(
  assets: CharMsAssets,
  appearance: CharMsAppearance,
  frame: number,
  colorTick = 0,
): CharMsRenderResult | null {
  const pose = resolveCharMsPose(assets, frame);

  if (!pose) {
    return null;
  }

  const layers: CharMsLayer[] = [];
  const covered = new Set<LegacyPart>();
  const hidden = new Set<LegacyPart>();
  const layerSlotByPart = new Map<LegacyPart, number>();

  for (const plan of buildPartPlans(appearance)) {
    const partOrder = PART_ORDER.indexOf(plan.logicalPart);
    const group = atlasesForItem(assets, plan.logicalPart, plan.itemId);
    const atlas = group[0] ?? null;

    // 아이템이 없어도 동작 자체는 아틀라스에 있으므로, 폴백 부위의 z-order
    // 슬롯을 얻기 위해 대표 아틀라스의 동작 layer를 먼저 챙겨 둔다.
    if (plan.legacyPart) {
      const reference =
        atlas ?? assets.atlasesByLogicalPart.get(plan.logicalPart)?.[0] ?? null;
      const action = reference
        ? resolveActionForPart(reference, pose.state, pose.direction)
        : null;
      const token = action?.frames[pose.tick % action.frames.length];

      if (token) {
        layerSlotByPart.set(plan.legacyPart, token.layer);
      }
    }

    if (!atlas || !plan.supported) {
      continue;
    }

    // 아이템이 여러 아틀라스에 쪼개져 있으면 프레임을 가진 쪽을 찾을 때까지 훑는다.
    let hitAtlas: CharMsAtlasAssets | null = null;
    let resolved: {
      token: CharMsActionToken;
      frame: CharMsFrame | null;
    } | null = null;
    let hasAction = false;

    for (const candidate of group) {
      const action = resolveActionForPart(
        candidate,
        pose.state,
        pose.direction,
      );

      if (!action?.frames.length) {
        continue;
      }

      hasAction = true;
      const attempt =
        resolveCharMsItemFrame(
          candidate,
          plan.itemId,
          pose.state,
          pose.direction,
          pose.tick,
        ) ??
        // 방패 창 자세처럼 대체 동작을 쓴 경우 직접 프레임을 찾는다.
        resolveDirectFrame(
          candidate,
          plan.itemId,
          action.frames[pose.tick % action.frames.length],
        );

      if (attempt?.frame) {
        hitAtlas = candidate;
        resolved = attempt;
        break;
      }
    }

    if (!hasAction) {
      // 기승 자세의 무기·방패처럼 메월 데이터가 일부러 비워 둔 부위다.
      // EPF로도 그리면 안 되므로 폴백에서 뺀다.
      if (plan.legacyPart) {
        hidden.add(plan.legacyPart);
      }

      continue;
    }

    if (!hitAtlas || !resolved?.frame) {
      continue;
    }

    const paletteFrameCount =
      hitAtlas.palette && assets.palettes
        ? assets.palettes.paletteFrameCount(
            hitAtlas.palette,
            plan.itemId,
            plan.dyeId,
          )
        : 1;
    const animationFrame =
      paletteFrameCount > 1 ? Math.abs(colorTick) % paletteFrameCount : 0;
    const lut = buildColorLut(
      assets,
      hitAtlas,
      plan.itemId,
      plan.colorIndex,
      plan.dyeId,
      animationFrame,
    );

    layers.push({
      logicalPart: plan.logicalPart,
      legacyPart: plan.legacyPart,
      token: resolved.token,
      partOrder,
      bitmap: rasterize(
        hitAtlas.pixels,
        resolved.frame,
        lut,
        assets.transparentIndex,
      ),
    });

    if (plan.legacyPart) {
      covered.add(plan.legacyPart);
      layerSlotByPart.set(plan.legacyPart, resolved.token.layer);
    }
  }

  const baseWorldFrame =
    layers.find((layer) => layer.logicalPart === 'armor')?.token.worldFrame ??
    layers.find((layer) => layer.logicalPart === 'head')?.token.worldFrame ??
    layers[0]?.token.worldFrame ??
    frame + 1;
  const orders = assets.drawOrders;
  const classicOrder = orders.length
    ? (orders[
        (((baseWorldFrame - 1) % orders.length) + orders.length) % orders.length
      ] ?? '')
    : '';

  return { pose, layers, covered, hidden, classicOrder, layerSlotByPart };
}

function resolveDirectFrame(
  atlas: CharMsAtlasAssets,
  itemId: string,
  token: CharMsActionToken | undefined,
) {
  if (!token) {
    return null;
  }

  const frame = atlas.getFrame(itemId, token.worldFrame);
  return frame ? { token, frame } : null;
}

export interface CharMsSortableLayer {
  logicalPart: CharMsLogicalPart;
  token: CharMsActionToken;
  partOrder: number;
  bitmap: DecodedBitmap;
}

/** 뒤에서 앞 순서로 정렬한다. 폴백 부위도 같은 규칙으로 함께 정렬된다. */
export function sortCharMsLayers<T extends CharMsSortableLayer>(
  layers: T[],
  classicOrder: string,
) {
  return layers
    .slice()
    .sort((first, second) =>
      compareCharMsCompositeLayersBackToFront(first, second, classicOrder),
    );
}
