import { MarketCatalogItem, parseMarketMessage } from './game-market.parser';

const catalog: MarketCatalogItem[] = [
  { id: 1, name: '도토리', type: 't' },
  { id: 2, name: '괴력선창', type: 'w' },
  { id: 3, name: '[꾸밈]진일신검', type: 'w' },
  { id: 4, name: '괴력남만곤봉', type: 'w' },
  { id: 5, name: '수정의귀걸이', type: 'r' },
  { id: 6, name: '마법의반지', type: 'r' },
  { id: 7, name: '[꾸밈]남자수영복', type: 'a' },
  { id: 8, name: '[꾸밈]해골갑옷', type: 'a' },
  { id: 9, name: '녹호박', type: 't' },
  { id: 10, name: '녹호박단추', type: 't' },
  { id: 11, name: '녹호박별검', type: 'w' },
  { id: 12, name: '진호박', type: 't' },
  { id: 13, name: '황금호박', type: 't' },
  { id: 14, name: '늑대의송곳니', type: 't' },
  { id: 15, name: '은나무가지', type: 't' },
  { id: 16, name: '해골갑옷', type: 'a' },
  { id: 17, name: '주술갑옷', type: 'a' },
  { id: 17, name: '[꾸밈]주술갑옷', type: 'a' },
  { id: 18, name: '청일기창', type: 'w' },
  { id: 19, name: '[꾸밈]청일기창', type: 'w' },
  { id: 20, name: '적화접선', type: 'w' },
  { id: 21, name: '[꾸밈]적화접선', type: 'w' },
  { id: 22, name: '황염곤봉', type: 'w' },
  { id: 23, name: '[꾸밈]황염곤봉', type: 'w' },
  { id: 24, name: '만리향씨앗', type: 't' },
  { id: 25, name: '쇠조각', type: 't' },
];

describe('parseMarketMessage', () => {
  it('별칭·염색·기본 만 단위를 판매 호가로 해석한다', () => {
    expect(parseMarketMessage('진분홍 괴력 300팜', catalog)).toEqual([
      expect.objectContaining({
        side: 'sell',
        itemName: '괴력선창',
        dyeName: '진분홍색',
        priceGold: 3_000_000,
        currency: 'gold',
        excludedFromGeneral: false,
      }),
    ]);
  });

  it('형변 아이템 순서와 무관하게 강제 베이스를 고른다', () => {
    expect(
      parseMarketMessage('진일 형변 은묵 괴력 3000 ㅍㅍㅍ', catalog),
    ).toEqual([
      expect.objectContaining({
        itemName: '괴력선창',
        transformItemName: '[꾸밈]진일신검',
        dyeName: '은묵',
        priceGold: 30_000_000,
        excludedFromGeneral: true,
        exclusionReason: 'transform',
      }),
    ]);
  });

  it('긴 정식 이름을 짧은 괴력 별칭보다 먼저 매칭한다', () => {
    expect(parseMarketMessage('괴력남만곤봉 650 팜', catalog)).toEqual([
      expect.objectContaining({
        itemName: '괴력남만곤봉',
        priceGold: 6_500_000,
      }),
    ]);
  });

  it('도토리는 게임 아이템이 아닌 현금 비율로 분리한다', () => {
    expect(parseMarketMessage('[팝니다] 도토리 0.95 [팝니다]', catalog)).toEqual([
      expect.objectContaining({
        side: 'sell',
        itemName: '도토리',
        itemId: -1,
        currency: 'cash',
        priceCashWon: 9_500,
      }),
    ]);
  });

  it('쉼표로 적은 도토리 소수 비율도 현금 가격으로 해석한다', () => {
    expect(parseMarketMessage('도토리 0,95 팝니다', catalog)).toEqual([
      expect.objectContaining({ currency: 'cash', priceCashWon: 9_500 }),
    ]);
  });

  it('형변 표기가 없어도 강제 베이스와 붙여 쓴 외형을 한 호가로 묶는다', () => {
    expect(parseMarketMessage('괴력남자수영복 700 팜', catalog)).toEqual([
      expect.objectContaining({
        itemName: '괴력선창',
        transformItemName: '[꾸밈]남자수영복',
        priceGold: 7_000_000,
      }),
    ]);
  });

  it('앞 아이템의 염색을 다음 아이템에 전파하지 않는다', () => {
    const result = parseMarketMessage(
      '진분홍 괴력 300, 마법의반지 20 팜',
      catalog,
    );
    expect(result[0]).toEqual(expect.objectContaining({ dyeName: '진분홍색' }));
    expect(result[1]).toEqual(expect.objectContaining({ dyeName: undefined }));
  });

  it('알 수 없는 베이스의 괄호 안 외형만 시세로 잘못 저장하지 않는다', () => {
    expect(parseMarketMessage('호박별봉(꾸진일) 500 팜', catalog)).toEqual([]);
  });

  it('꾸 접두사가 붙은 장비는 존재하는 꾸밈 아이템으로 우선 매칭한다', () => {
    expect(parseMarketMessage('꾸해갑 200 삽니다', catalog)).toEqual([
      expect.objectContaining({
        itemName: '[꾸밈]해골갑옷',
        priceGold: 2_000_000,
      }),
    ]);
  });

  it('동일 ID여도 일반 장비와 꾸밈 장비 이름을 분리한다', () => {
    expect(parseMarketMessage('주술갑옷 500 팝니다', catalog)).toEqual([
      expect.objectContaining({ itemId: 17, itemName: '주술갑옷' }),
    ]);
    expect(parseMarketMessage('[꾸밈]주술갑옷 1만전 삽니다', catalog)).toEqual([
      expect.objectContaining({ itemId: 17, itemName: '[꾸밈]주술갑옷' }),
    ]);
  });

  it('꾸밈 무기 축약과 일반 무기 축약을 서로 다른 아이템으로 매칭한다', () => {
    expect(parseMarketMessage('청일 800 팝니다', catalog)).toEqual([
      expect.objectContaining({ itemName: '청일기창' }),
    ]);
    expect(parseMarketMessage('꾸청일 100 팝니다', catalog)).toEqual([
      expect.objectContaining({ itemName: '[꾸밈]청일기창' }),
    ]);
    expect(parseMarketMessage('(꾸)적화접선 120 팝니다', catalog)).toEqual([
      expect.objectContaining({ itemName: '[꾸밈]적화접선' }),
    ]);
    expect(parseMarketMessage('[꾸]황염곤봉 90 팝니다', catalog)).toEqual([
      expect.objectContaining({ itemName: '[꾸밈]황염곤봉' }),
    ]);
  });

  it('교환 조건의 더하기 금액을 독립 매도 호가로 저장하지 않는다', () => {
    expect(
      parseMarketMessage(
        '분홍 활복 해갑 팝니다@ 두쫀쿠 가능 / 순정해갑+1300가능',
        catalog,
      ),
    ).toEqual([]);
    expect(parseMarketMessage('순정해갑 1300 팝니다', catalog)).toEqual([
      expect.objectContaining({ itemName: '해골갑옷', priceGold: 13_000_000 }),
    ]);
  });

  it('내구도와 가격을 구분하고 구분자 앞 섹션에도 거래 방향을 상속한다', () => {
    const result = parseMarketMessage(
      '도토리 0.95 // 수정의귀걸이94%35 팜',
      catalog,
    );
    expect(result).toEqual([
      expect.objectContaining({ itemName: '도토리', priceCashWon: 9_500 }),
      expect.objectContaining({
        itemName: '수정의귀걸이',
        durability: 94,
        priceGold: 350_000,
      }),
    ]);
  });

  it('괄호 밖 단일 슬래시는 거래 구분자로 사용해 뒤쪽 숫자를 앞 아이템 가격으로 쓰지 않는다', () => {
    expect(parseMarketMessage('괴력 팜/랑4지름셋 팜', catalog)).toEqual([]);
  });

  it('가격 뒤의 장돌을 수량 단위 장으로 오인하지 않는다', () => {
    expect(parseMarketMessage('수정의귀걸이3 장돌7 삽니다', catalog)).toEqual([
      expect.objectContaining({ itemName: '수정의귀걸이', priceGold: 30_000 }),
    ]);
  });

  it('띄어 쓴 호박 무기는 긴 정식 아이템으로 매칭한다', () => {
    expect(parseMarketMessage('녹호박 별검 300 팝니다', catalog)).toEqual([
      expect.objectContaining({ itemName: '녹호박별검', priceGold: 3_000_000 }),
    ]);
  });

  it('호박무기처럼 불명확한 표현을 일반 호박으로 집계하지 않는다', () => {
    expect(parseMarketMessage('녹호박무기 900 팝니다', catalog)).toEqual([]);
  });

  it('저가 호박류와 늑대 재료는 단위 없는 가격을 전 단위로 해석한다', () => {
    expect(parseMarketMessage('녹호박 900 팝니다', catalog)).toEqual([
      expect.objectContaining({ priceGold: 900 }),
    ]);
    expect(parseMarketMessage('늑대의송곳니 750 팝니다', catalog)).toEqual([
      expect.objectContaining({ priceGold: 750 }),
    ]);
    expect(parseMarketMessage('황금호박 900 팝니다', catalog)).toEqual([
      expect.objectContaining({ priceGold: 9_000_000 }),
    ]);
  });

  it('형변과 고가 염색만 일반 금전 시세에서 제외 표시한다', () => {
    expect(parseMarketMessage('홍몽 괴력 3000 팝니다', catalog)).toEqual([
      expect.objectContaining({
        dyeName: '홍몽',
        excludedFromGeneral: true,
        exclusionReason: 'premium_dye',
      }),
    ]);
    expect(parseMarketMessage('진분홍 괴력 300 팝니다', catalog)).toEqual([
      expect.objectContaining({ excludedFromGeneral: false }),
    ]);
  });

  it('은나무가지는 작은 숫자를 현금, 천 단위 숫자를 바돈으로 구분한다', () => {
    expect(parseMarketMessage('은가 27콩에 팝니다', catalog)).toEqual([
      expect.objectContaining({ currency: 'cash', priceCashWon: 270_000 }),
    ]);
    expect(parseMarketMessage('은가 2800 팝니다', catalog)).toEqual([
      expect.objectContaining({ currency: 'gold', priceGold: 28_000_000 }),
    ]);
    expect(parseMarketMessage('은가 27 (바돈) 팝니다', catalog)).toEqual([
      expect.objectContaining({ currency: 'gold', priceGold: 270_000 }),
    ]);
  });

  it('아이템을 도토리나 쫀쿠로 거래하면 현금 호가로 저장한다', () => {
    expect(parseMarketMessage('괴력 두쫀쿠 15에 팝니다', catalog)).toEqual([
      expect.objectContaining({ currency: 'cash', priceCashWon: 150_000 }),
    ]);
  });

  it('쫀쿠 수량만 있는 광고를 현금 가격으로 오인하지 않는다', () => {
    expect(parseMarketMessage('두쫀쿠 300 팝니다', catalog)).toEqual([]);
  });

  it('수량 뒤에 적은 묶음 총액은 개당 가격으로 환산한다', () => {
    expect(
      parseMarketMessage(
        '만리향씨앗 16개 10만에 개떨이 12시 10분까지만 ㅍㅍㅍ',
        catalog,
      ),
    ).toEqual([
      expect.objectContaining({
        itemName: '만리향씨앗',
        quantity: 16,
        priceGold: 6_250,
        bundlePriceDivided: true,
        bundleTotalPriceAmount: 100_000,
      }),
    ]);
    expect(
      parseMarketMessage(
        '[팝니다] 만리향씨앗10개(8.5), [꾸]석단장, 천풍선',
        catalog,
      ),
    ).toEqual([
      expect.objectContaining({
        itemName: '만리향씨앗',
        quantity: 10,
        priceGold: 8_500,
        bundlePriceDivided: true,
        bundleTotalPriceAmount: 85_000,
      }),
    ]);
  });

  it('가격 뒤의 수량과 개당 표시는 이미 개당 가격으로 유지한다', () => {
    expect(parseMarketMessage('만리향씨앗 0.9 23개 팝니다', catalog)).toEqual([
      expect.objectContaining({
        quantity: 23,
        priceGold: 9_000,
        bundlePriceDivided: false,
      }),
    ]);
    expect(
      parseMarketMessage(
        '만리향씨앗 개당 8천원에 16개 팝니다 다 사면 12만원',
        catalog,
      ),
    ).toEqual([
      expect.objectContaining({
        quantity: 16,
        priceGold: 8_000,
        bundlePriceDivided: false,
      }),
    ]);
  });

  it('전과 천원 단위를 만 단위로 확대하지 않는다', () => {
    expect(parseMarketMessage('만리향씨앗 7000전 팝니다', catalog)).toEqual([
      expect.objectContaining({ priceGold: 7_000 }),
    ]);
    expect(parseMarketMessage('만리향씨앗사요 7처넌', catalog)).toEqual([
      expect.objectContaining({ priceGold: 7_000 }),
    ]);
  });

  it('앞 아이템 수량을 뒤 아이템에 전파하지 않는다', () => {
    const result = parseMarketMessage(
      '쇠조각 개당 3.3에 3개 팔아요~ 만리향씨앗 0.9 23개 팝니다~',
      catalog,
    );
    expect(result).toEqual([
      expect.objectContaining({
        itemName: '쇠조각',
        quantity: 3,
        priceGold: 33_000,
      }),
      expect.objectContaining({
        itemName: '만리향씨앗',
        quantity: 23,
        priceGold: 9_000,
      }),
    ]);
  });
});
