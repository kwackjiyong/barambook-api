// 구바람("(구) 바람의나라 | 흑부엉", 내부명 Baram1996) 전용 이미지는 전부
// CDN(s3://barambook → CloudFront)에 올라가 있다.
//
//   gu-baram/mob/{mobId}.png    몬스터 정면 정지 그림
//   gu-baram/item/{itemId}.png  아이템 아이콘
//
// 옛날바람과 달리 스프라이트 시트를 만들지 않았다. 목록·상세에 쓸 정지 한 장이면
// 충분하고, 아이콘은 한 아이템에 한 장이라 아이템 번호로 바로 부른다.

const CDN_BASE = (
  process.env.CDN_URL ?? 'https://d9dw0d9hih79y.cloudfront.net'
).replace(/\/+$/, '');

export const GU_BARAM_ASSET_ROOT = `${CDN_BASE}/gu-baram`;

export function guBaramMobImageUrl(mobId: number) {
  return `${GU_BARAM_ASSET_ROOT}/mob/${mobId}.png`;
}

export function guBaramItemIconUrl(itemId: number) {
  return `${GU_BARAM_ASSET_ROOT}/item/${itemId}.png`;
}
