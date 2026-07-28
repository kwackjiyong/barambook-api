import type { CharMsAssets } from './assets';

/**
 * 고전 프레임 번호 ↔ 메월 (state, direction, tick) 변환.
 *
 * char-ms의 worldFrame은 갑옷·머리 아틀라스에서 고전 프레임 번호 + 1과 같다.
 * drawX/drawY도 EPF의 left/top과 일치하므로, 서버는 기존 프레임 번호를 그대로
 * 받은 뒤 렌더 직전에만 메월 동작으로 바꿔 준다.
 */

export interface CharMsPose {
  state: string;
  direction: number;
  tick: number;
}

/**
 * 같은 프레임 번호를 여러 동작이 가리킬 때 먼저 선언한 동작이 이긴다.
 * 정지 → 이동 → 공격 → 그 밖의 동작 순.
 */
const STATE_PRIORITY = [
  'stand',
  'stand.sword',
  'stand.spear',
  'stand.fan',
  'stand.bow',
  'stand.riding',
  'walk',
  'walk.sword',
  'walk.spear',
  'walk.fan',
  'walk.bow',
  'walk.riding',
  'attack',
  'attack.spear',
  'attack.bow',
  'throw',
  'cast',
  'get',
  'eat',
];

/** 프레임 번호를 정의하는 기준 아틀라스. 갑옷이 가장 많은 동작을 가진다. */
const POSE_SOURCE_LABELS = ['armor', 'head', 'hair', 'face'] as const;

export type CharMsPoseTable = Map<number, CharMsPose>;

export function buildCharMsPoseTable(assets: CharMsAssets): CharMsPoseTable {
  const table: CharMsPoseTable = new Map();

  const claim = (
    state: string,
    direction: number,
    tick: number,
    worldFrame: number,
  ) => {
    const frame = worldFrame - 1;

    if (frame >= 0 && !table.has(frame)) {
      table.set(frame, { state, direction, tick });
    }
  };

  for (const label of POSE_SOURCE_LABELS) {
    const atlas = assets.atlasByLabel.get(label);

    if (!atlas) {
      continue;
    }

    const actions = [...atlas.actionByKey.values()];
    const ordered = [
      ...STATE_PRIORITY.flatMap((state) =>
        actions.filter((action) => action.state === state),
      ),
      ...actions.filter((action) => !STATE_PRIORITY.includes(action.state)),
    ];

    for (const action of ordered) {
      if (action.direction < 1) {
        continue;
      }

      action.frames.forEach((token, tick) => {
        claim(action.state, action.direction, tick, token.worldFrame);
      });
    }
  }

  return table;
}

/**
 * 고전 프레임 번호를 메월 동작으로 바꾼다.
 *
 * 탈것을 골랐다고 기승 자세가 되지는 않는다. 기승은 R 키(말타기 모션, 고전
 * 프레임 80~91)로만 들어가고, 탈것 선택은 그때 무엇을 탈지만 정한다.
 */
export function resolveCharMsPose(
  assets: CharMsAssets,
  frame: number,
): CharMsPose | null {
  return assets.poseTable.get(frame | 0) ?? null;
}
