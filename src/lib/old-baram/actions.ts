export const DIRECTIONS = [
  { code: 2, key: 'north', label: '북' },
  { code: 8, key: 'east', label: '동' },
  { code: 1, key: 'south', label: '남' },
  { code: 4, key: 'west', label: '서' },
] as const;

export const PART_HEAD = 1;
export const PART_BODY = 2;
export const PART_WEAPON = 3;
export const PART_SHIELD = 4;

export type PartSlot =
  | typeof PART_HEAD
  | typeof PART_BODY
  | typeof PART_WEAPON
  | typeof PART_SHIELD;
export type OldBaramState =
  | 'stand'
  | 'move'
  | 'attack'
  | 'bow'
  | 'riding'
  | 'cast'
  | 'pickup'
  | 'eat'
  | 'die'
  | 'emote';

type DirectionTable = Record<number, number>;

function byDirection(
  north: number,
  east: number,
  south: number,
  west: number,
): DirectionTable {
  return { 2: north, 8: east, 1: south, 4: west };
}

export const STAND_ACTIONS: Record<number, DirectionTable> = {
  0: byDirection(0, 3, 6, 9),
  1: byDirection(12, 15, 18, 21),
  2: byDirection(32, 35, 38, 41),
  3: byDirection(52, 55, 58, 61),
  4: byDirection(80, 83, 86, 89),
};

export const MOVE_ACTIONS: Record<number, Record<number, DirectionTable>> = {
  0: {
    0: byDirection(1, 4, 7, 10),
    1: STAND_ACTIONS[0],
    2: byDirection(2, 5, 8, 11),
  },
  1: {
    0: byDirection(13, 16, 19, 22),
    1: STAND_ACTIONS[1],
    2: byDirection(14, 17, 20, 23),
  },
  2: {
    0: byDirection(33, 36, 39, 42),
    1: STAND_ACTIONS[2],
    2: byDirection(34, 37, 40, 43),
  },
  3: {
    0: byDirection(53, 56, 59, 62),
    1: STAND_ACTIONS[3],
    2: byDirection(54, 57, 60, 63),
  },
  4: {
    0: byDirection(81, 84, 87, 90),
    1: STAND_ACTIONS[4],
    2: byDirection(82, 85, 88, 91),
  },
};

export const ATTACK_ACTIONS: Record<number, Record<number, DirectionTable>> = {
  0: {
    0: byDirection(24, 26, 28, 30),
    1: byDirection(25, 27, 29, 31),
  },
  1: {
    0: byDirection(24, 26, 28, 30),
    1: byDirection(25, 27, 29, 31),
  },
  2: {
    0: byDirection(44, 46, 48, 50),
    1: byDirection(45, 47, 49, 51),
  },
  3: {
    0: byDirection(64, 66, 68, 70),
    1: byDirection(65, 67, 69, 71),
  },
  4: { 0: STAND_ACTIONS[4], 1: STAND_ACTIONS[4] },
};

/**
 * 걷기에 실제로 쓰는 자세 순서.
 * MOVE_ACTIONS 의 1번은 두 발을 모은 서기 자세이고, 발을 내딛는 자세(0·2) 사이마다
 * 이 서기를 한 번씩 거쳐야 걸음이 이어진다. 0-1-2 로만 돌리면 오른발 다음에
 * 곧바로 왼발이 나와 한 걸음이 튄다.
 */
export const MOVE_POSES = [0, 1, 2, 1] as const;

/**
 * 활·말타기 버튼의 재생 순서.
 * 두 동작은 별도 파츠가 아니라 갑옷에 통째로 그려진 자세이며, 버튼을 누른 직후에는
 * 안정된 서기 프레임을 보여 준 뒤 양쪽 발 자세를 번갈아 재생한다.
 */
export const SPECIAL_POSES = [1, 0, 1, 2] as const;

export const CAST_ACTION = byDirection(72, 73, 74, 75);
export const PICK_UP_ACTION = byDirection(76, 77, 78, 79);
export const EAT_ACTION = byDirection(92, 92, 92, 92);
export const DIE_ACTION = byDirection(104, 104, 104, 104);

type EmoteTable = DirectionTable | Record<number, DirectionTable>;

export const EMOTE_ACTIONS: Record<number, EmoteTable> = (() => {
  const emotes: Record<number, EmoteTable> = {};
  let position = 105;
  for (let index = 0; index <= 8; index += 1) {
    emotes[index] = byDirection(
      position,
      position + 1,
      position + 2,
      position + 3,
    );
    position += 4;
  }
  emotes[9] = byDirection(position, position, position, position);
  position += 1;
  emotes[10] = byDirection(position, position + 1, position + 2, position + 3);
  position += 4;
  emotes[11] = {
    0: byDirection(position, position, position, position),
    1: byDirection(position + 1, position + 1, position + 1, position + 1),
    2: byDirection(position + 2, position + 2, position + 2, position + 2),
    3: byDirection(position + 3, position + 3, position + 3, position + 3),
  };
  for (let index = 12; index <= 15; index += 1) {
    position += 4;
    emotes[index] = byDirection(
      position,
      position + 1,
      position + 2,
      position + 3,
    );
  }
  return emotes;
})();

/**
 * 머리 리소스는 액션 149번까지만 있어 감정표현 12~15(액션 150~165)에서 머리가 통째로 빠진다.
 * 이 구간의 갑옷 프레임은 앞선 액션과 완전히 같은 그림이라(갑옷 152종 전수 확인)
 * 같은 자세의 머리를 그대로 빌려 쓴다.
 */
export const ACTION_ALIASES: Record<number, number> = {
  150: 96,
  151: 97,
  152: 98,
  153: 99,
  154: 93,
  155: 93,
  156: 93,
  157: 93,
  158: 0,
  159: 3,
  160: 6,
  161: 9,
  162: 96,
  163: 97,
  164: 98,
  165: 99,
};

const PART_BY_CHAR: Record<string, PartSlot> = {
  h: PART_HEAD,
  b: PART_BODY,
  w: PART_WEAPON,
  s: PART_SHIELD,
};

const ORDER0 =
  'wbhs;wbhs;sbhw;sbhw;sbhw;sbhw;bhsw;sbhw;wbhs;wbhs;wbhs;wbhs;wbhs;wbhs;swbh;sbhw;sbhw;sbhw;bhsw;sbhw;bhsw;wbhs;wbhs;wbhs;sbhw;wbhs;sbhw;wsbh;wbhs;sbhw;wbhs;sbwh;wbh0;wbh0;wbh0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;wbh0;wbh0;wbh0;wbh0;wbh0;bhw0;bhw0;bhw0;bhw0;wbh0;wbh0;bhw0;bhw0;bhw0;wbh0;wbh0;wbh0;wbh0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;wbh0;wbh0;wbh0;whb0;wbh0;whb0;wbh0;wbh0;bhw0;bhw0;bhw0;bhw0;bhw0;bhw0;wbh0;wbh0;bhw0;bhw0;bhw0;bhw0;wbh0;wbh0;bh00;bh00;bh00;bh00;bh00;bh00;bh00;bh00;bh00;bh00;bh00;bh00;h000';

export const DRAW_ORDERS: Record<number, Record<number, PartSlot>> = (() => {
  const orders: Record<number, Record<number, PartSlot>> = {};
  let index = 0;
  for (const order of ORDER0.split(';')) {
    const slots: Record<number, PartSlot> = {};
    let position = 4;
    for (const character of order) {
      if (character !== '0') slots[position] = PART_BY_CHAR[character];
      position -= 1;
    }
    orders[index] = slots;
    index += 1;
  }
  const emotionDefault = orders[103];
  for (let action = 105; action <= 149; action += 1) {
    orders[action] = emotionDefault;
  }
  for (let frame = 0; frame < 4; frame += 1) {
    orders[150 + frame] = orders[96 + frame];
  }
  for (let action = 154; action <= 161; action += 1) {
    orders[action] = emotionDefault;
  }
  for (let frame = 0; frame < 4; frame += 1) {
    orders[162 + frame] = orders[96 + frame];
  }
  return orders;
})();

export const STATES: ReadonlyArray<{
  key: OldBaramState;
  label: string;
  frames: number;
}> = [
  { key: 'stand', label: '서기', frames: 1 },
  { key: 'move', label: '걷기', frames: MOVE_POSES.length },
  { key: 'attack', label: '공격', frames: 2 },
  { key: 'bow', label: '활', frames: SPECIAL_POSES.length },
  { key: 'riding', label: '말타기', frames: SPECIAL_POSES.length },
  { key: 'cast', label: '주문', frames: 1 },
  { key: 'pickup', label: '줍기', frames: 1 },
  { key: 'eat', label: '먹기', frames: 1 },
  { key: 'die', label: '죽음', frames: 1 },
  { key: 'emote', label: '감정표현', frames: 1 },
];

export function weaponTypeOf(weaponId: number): number {
  if (weaponId === -1) return 0;
  if (weaponId < 10000) return 1;
  if (weaponId < 20000) return 2;
  if (weaponId < 30000) return 3;
  if (weaponId < 40000) return 1;
  return 0;
}

export function weaponPartOf(
  weaponId: number,
): 'sword' | 'spear' | 'fan' | null {
  if (weaponId === -1) return null;
  if (weaponId < 10000) return 'sword';
  if (weaponId < 20000) return 'spear';
  if (weaponId < 30000) return null;
  if (weaponId < 40000) return 'fan';
  return null;
}

export function resolveActionId({
  state,
  weaponType,
  direction,
  frame = 0,
  emote = 0,
}: {
  state: OldBaramState;
  weaponType: number;
  direction: number;
  frame?: number;
  emote?: number;
}): number | undefined {
  switch (state) {
    case 'stand':
      return STAND_ACTIONS[weaponType]?.[direction];
    case 'move':
      return MOVE_ACTIONS[weaponType]?.[
        MOVE_POSES[frame % MOVE_POSES.length]
      ]?.[direction];
    case 'attack':
      return ATTACK_ACTIONS[weaponType]?.[frame % 2]?.[direction];
    case 'bow':
      return MOVE_ACTIONS[3]?.[SPECIAL_POSES[frame % SPECIAL_POSES.length]]?.[
        direction
      ];
    case 'riding':
      return MOVE_ACTIONS[4]?.[SPECIAL_POSES[frame % SPECIAL_POSES.length]]?.[
        direction
      ];
    case 'cast':
      return CAST_ACTION[direction];
    case 'pickup':
      return PICK_UP_ACTION[direction];
    case 'eat':
      return EAT_ACTION[direction];
    case 'die':
      return DIE_ACTION[direction];
    case 'emote': {
      const table = EMOTE_ACTIONS[emote];
      if (!table) return undefined;
      if (emote === 11) {
        return (table as Record<number, DirectionTable>)[frame % 4]?.[
          direction
        ];
      }
      return (table as DirectionTable)[direction];
    }
  }
}
