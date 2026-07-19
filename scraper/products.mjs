// 商品マスタ: 抽選対象になりがちな商品の定価・別名 (2026-07調査、定価は公式裏取り済み)
// market_seed は調査時点の参考相場(推定)。resale.mjs のライブ取得が成功すると上書きされる。

const CATALOG = [
  { key: 'storm-emeralda', name: 'MEGA拡張パック「ストームエメラルダ」BOX', msrp: 6000, re: /ストームエメラルダ|storm[-\s]?emeralda/i },
  { key: 'abyss-eye', name: 'MEGA拡張パック「アビスアイ」BOX', msrp: 6000, re: /アビスアイ/, market_seed: 10500, seed_src: 'PRICE BASE 2026-07' },
  { key: 'ninja-spinner', name: 'MEGA拡張パック「ニンジャスピナー」BOX', msrp: 5400, re: /ニンジャスピナー/, market_seed: 11400, seed_src: 'PRICE BASE 2026-06' },
  { key: 'munikis-zero', name: 'MEGA拡張パック「ムニキスゼロ」BOX', msrp: 5400, re: /ムニキスゼロ/, market_seed: 8500, seed_src: 'PRICE BASE 2026-07' },
  { key: 'mega-dream', name: 'MEGAハイクラスパック「MEGAドリームex」BOX', msrp: 5500, re: /(MEGA|メガ)\s*ドリーム/i, market_seed: 14200, seed_src: 'PRICE BASE 2026-06' },
  { key: 'mega-sinfonia', name: 'MEGA拡張パック「メガシンフォニア」BOX', msrp: 5400, re: /メガシンフォニア/, market_seed: 11000, seed_src: 'PRICE BASE 2026-04' },
  { key: 'mega-brave', name: 'MEGA拡張パック「メガブレイブ」BOX', msrp: 5400, re: /メガブレイブ/, market_seed: 13800, seed_src: 'PRICE BASE 2026-05' },
  { key: 'celebration-30th', name: 'MEGA拡張パック「30th CELEBRATION」BOX', msrp: 7200, re: /30th\s*CELEBRATION|30周年記念(商品|パック)|30th|３０周年/i },
  { key: 'futuristic-box', name: '30th CELEBRATION FUTURISTIC BOX', msrp: 27500, re: /FUTURISTIC/i },
  { key: 'premium-eevee', name: '30thプレミアムデッキセット エーフィ・ブラッキー', msrp: 6200, re: /エーフィ.{0,3}ブラッキー/ },
  { key: 'mega-starter-set', name: 'MEGAスターターセットex (各種)', msrp: 1800, re: /スターターセット\s*ex|スターターセットex/ },
  { key: 'start-deck-100', name: 'MEGAスタートデッキ100 バトルコレクション', msrp: 891, re: /スタートデッキ100/ },
  { key: 'pokeca-151', name: '強化拡張パック「ポケモンカード151」BOX', msrp: 5800, re: /151/, market_seed: 59000, seed_src: 'PRICE BASE 2026-07' },
  { key: 'terastal-fes', name: 'ハイクラスパック「テラスタルフェスex」BOX', msrp: 5500, re: /テラスタルフェス/, market_seed: 24500, seed_src: 'PRICE BASE 2026-05' },
  { key: 'black-bolt', name: 'SV拡張パック「ブラックボルト」BOX', msrp: 5400, re: /ブラックボルト/ },
  { key: 'white-flare', name: 'SV拡張パック「ホワイトフレア」BOX', msrp: 5400, re: /ホワイトフレア/ },
  { key: 'inferno-x', name: '拡張パック「インフェルノX」BOX', msrp: 5400, re: /インフェルノ\s*X/i },
  { key: 'chouden-breaker', name: 'SV拡張パック「超電ブレイカー」BOX', msrp: 5400, re: /超電ブレイカー/ },
  { key: 'rocket-dan', name: 'SV拡張パック「ロケット団の栄光」BOX', msrp: 5400, re: /ロケット団の栄光/ },
  { key: 'mega-gengar-starter', name: 'スターターセットMEGA メガゲンガーex', msrp: 1980, re: /メガゲンガー/ },
];

export function loadProducts() {
  return CATALOG;
}

// テキストから商品を特定(先頭一致した最初の商品キー)
export function matchProduct(text) {
  if (!text) return null;
  for (const p of CATALOG) {
    if (p.re.test(text)) return p.key;
  }
  return null;
}
