# 옛날바람 서버 렌더러

`src/assets/dat/old-baram.obp` 한 파일을 API 서버 시작 시 메모리에 올리고,
요청된 파츠와 동작을 합성해 투명 PNG로 반환한다.

## 선택 목록

```http
GET /renderer/old-baram/options
```

머리, 갑옷, 무기, 방패의 ID와 사용 가능한 염색 번호, 동작 및 방향 목록을
JSON으로 반환한다.

## 염색 목록

```http
GET /renderer/old-baram/dyes?slot=head&head=0&body=20&weapon=-1&shield=-1&direction=1
```

`slot`(`head`/`body`/`weapon`/`shield`)이 가리키는 부위의 염색을 전부
같은 크기의 썸네일로 그려 한 응답에 담는다. 나머지 쿼리는 PNG 렌더링과 같고,
자세는 서기, 그림자·워터마크는 꺼진 채로 고정된다.

```json
{ "slot": "head", "item": 0, "zoom": 2, "width": 38, "height": 82,
  "dyes": [{ "dye": 0, "image": "<base64 PNG>" }] }
```

염색 하나에 요청 한 번씩 왕복하지 않도록 목록 팝업이 이 엔드포인트를 한 번만 부른다.

## 부위 선택 목록 시트

```sh
npx ts-node -T tools/build-old-baram-part-sheets.ts
```

부위별로 모든 아이템의 기본샷을 격자 PNG 한 장에 구워 `cdn-upload/` 에 쌓고,
S3 업로드 명령을 출력한다. 아이템이 수백 개라 API로 한 장씩 그리는 대신
CDN에 미리 올려 두고 프론트가 칸만 잘라 쓴다. 폴더 이름에 통파일 해시가 들어가
CloudFront 무효화 없이 새 시트로 갈아탄다. 업로드 뒤 프론트
`src/app/old-render/partSheets.ts` 의 판 번호를 함께 바꾼다.

## PNG 렌더링

```http
GET /renderer/old-baram?head=0&headDye=0&body=20&bodyDye=0&weapon=1&weaponDye=0&shield=0&shieldDye=0&state=attack&direction=1&frame=0&zoom=4
```

응답의 `Content-Type`은 `image/png`이다.

| 쿼리 | 기본값 | 설명 |
| --- | ---: | --- |
| `head`, `headDye` | 첫 머리, `0` | 머리와 염색 |
| `body`, `bodyDye` | 첫 갑옷, `0` | 갑옷과 염색 |
| `weapon`, `weaponDye` | `-1`, `0` | 무기와 염색. `-1`은 맨손 |
| `shield`, `shieldDye` | `-1`, `0` | 방패와 염색. `-1`은 없음 |
| `state` | `stand` | `stand`, `move`, `attack`, `cast`, `pickup`, `eat`, `die`, `emote` |
| `direction` | `1` | 남 `1`, 북 `2`, 서 `4`, 동 `8` |
| `frame` | `0` | 동작 프레임 |
| `emote` | `0` | 감정표현 번호 `0~15` |
| `colorFrame` | `0` | 색상 애니메이션 프레임 `0~7` |
| `shadow` | `true` | 그림자 표시 여부 |
| `zoom` | `4` | 최근접 확대 배율 `1~8` |

같은 파라미터의 PNG는 프로세스 메모리에 최대 512개까지 캐시한다.
통파일 위치는 기본적으로 `src/assets/dat/old-baram.obp`이며,
필요하면 `OLD_BARAM_OBP_PATH` 환경 변수로 변경할 수 있다.
