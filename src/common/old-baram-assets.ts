// 옛날바람 전용 이미지는 전부 CDN(s3://barambook → CloudFront)에 올라가 있다.
//
//   old-baram/item/{itemId}.png         아이템 아이콘
//   old-baram/mob/{imageKey}/still.png  몬스터 대표 정지 프레임(정면)
//   old-baram/mob/{imageKey}/sheet.png  몬스터 동작 스프라이트 시트
//   old-baram/mob/{imageKey}/sheet.json 시트 프레임 좌표·지연·동작 묶음
//   old-baram/minimap/{mapId}.webp      지도 미니맵
//
// imageKey는 보통 "{image}-{dye}"지만, 원본에 그 염색이 없으면 같은 image의
// 다른 염색 시트를 빌려 쓴다. 그래서 적재할 때 정해진 값을 그대로 쓴다.

const CDN_BASE = (
  process.env.CDN_URL ?? 'https://d9dw0d9hih79y.cloudfront.net'
).replace(/\/+$/, '');

export const OLD_BARAM_ASSET_ROOT = `${CDN_BASE}/old-baram`;

export function oldBaramItemIconUrl(itemId: number) {
  return `${OLD_BARAM_ASSET_ROOT}/item/${itemId}.png`;
}

export function oldBaramMobImageUrls(imageKey: string) {
  const base = `${OLD_BARAM_ASSET_ROOT}/mob/${imageKey}`;
  return {
    imageUrl: `${base}/still.png`,
    sheetUrl: `${base}/sheet.png`,
    sheetMetaUrl: `${base}/sheet.json`,
  };
}

export function oldBaramMinimapUrl(mapId: number) {
  return `${OLD_BARAM_ASSET_ROOT}/minimap/${mapId}.webp`;
}
