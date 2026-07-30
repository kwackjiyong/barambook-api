# 옛날바람 서버 렌더러

`src/assets/dat/old-baram.obp` 한 파일을 API 서버 시작 시 메모리에 올리고,
요청된 파츠와 동작을 합성해 투명 PNG로 반환한다.

## 선택 목록

```http
GET /renderer/old-baram/options
```

머리, 갑옷, 무기, 방패의 ID와 사용 가능한 염색 번호, 동작 및 방향 목록을
JSON으로 반환한다.

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
