// 부여 대미궁 주간 로테이션 규칙. 클라이언트 MeramMazeService 바이트코드를
// 해독해 그대로 옮긴 것이다 (barambook docs/maze_menu.md 참고).
//
//   앵커     그 해 1월 1일 06:00(KST) 이후 첫 목요일 06:00
//   주차     floor((지금 − 앵커) ÷ 7일) + 1, 앵커 이전이면 전년도 마지막 주
//   변형 표  [1..53]을 연도를 시드로 LCG(×1664525 +1013904223 mod 2^32)
//            Fisher–Yates 셔플, CurrentIndex = 표[주차] (없으면 1)
//   맵 ID    10000000 + index×1000 + base(500 입구, 501~508 대미궁1~8)
//
// 시간은 전부 "UTC 필드를 KST로 읽는" Date로 다뤄 서버 타임존을 타지 않는다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const THURSDAY = 4;

/** epoch ms → UTC 필드가 KST 벽시계인 Date. */
const toKstClock = (epochMs: number) => new Date(epochMs + KST_OFFSET_MS);

/** KST 벽시계 Date → epoch ms. */
const fromKstClock = (clock: Date) => clock.getTime() - KST_OFFSET_MS;

/** 그 해 1월 1일 06:00 이후 첫 목요일 06:00 (KST 벽시계). */
export function firstThursdayOfYear(year: number): Date {
  const clock = new Date(Date.UTC(year, 0, 1, 6, 0, 0));
  const until = (THURSDAY - clock.getUTCDay() + 7) % 7;
  clock.setUTCDate(clock.getUTCDate() + until);
  return clock;
}

export function weeksInYear(year: number): number {
  const first = firstThursdayOfYear(year);
  const last = new Date(Date.UTC(year, 11, 31, 23, 59, 0));
  return Math.floor((last.getTime() - first.getTime()) / DAY_MS / 7) + 1;
}

/** 연도 시드 LCG 셔플. 곱 최대 2^52.7이라 Number 정수 범위 안에서 정확하다. */
export function indicesByWeek(seedYear: number): number[] {
  const weeks: number[] = [];
  for (let i = 1; i <= 53; i += 1) weeks.push(i);
  let seed = seedYear;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed;
  };
  for (let i = weeks.length; i >= 2; i -= 1) {
    const j = (rand() % i) + 1;
    const swap = weeks[j - 1];
    weeks[j - 1] = weeks[i - 1];
    weeks[i - 1] = swap;
  }
  return weeks;
}

export interface MazeWeek {
  year: number;
  weekNumber: number;
  weeksInYear: number;
  index: number;
  /** 이번 변형이 시작된 목요일 06:00 KST (epoch ms). */
  startsAtMs: number;
  /** 다음 갱신(다음 목요일 06:00 KST, epoch ms). */
  endsAtMs: number;
}

export function mazeWeekAt(epochMs: number): MazeWeek {
  const nowClock = toKstClock(epochMs);
  let year = nowClock.getUTCFullYear();
  let first = firstThursdayOfYear(year);
  let weekNumber: number;
  let totalWeeks = weeksInYear(year);

  const days = (nowClock.getTime() - first.getTime()) / DAY_MS;
  if (days >= 0) {
    weekNumber = Math.floor(days / 7) + 1;
  } else {
    year -= 1;
    totalWeeks = weeksInYear(year);
    weekNumber = totalWeeks;
    first = firstThursdayOfYear(year);
  }

  const table = indicesByWeek(year);
  const index = table[weekNumber - 1] ?? 1;

  const startsClock = new Date(first.getTime() + (weekNumber - 1) * 7 * DAY_MS);
  const endsClock = new Date(startsClock.getTime() + 7 * DAY_MS);

  return {
    year,
    weekNumber,
    weeksInYear: totalWeeks,
    index,
    startsAtMs: fromKstClock(startsClock),
    endsAtMs: fromKstClock(endsClock),
  };
}

export const mazeMapId = (index: number, base: number) =>
  10000000 + index * 1000 + base;
