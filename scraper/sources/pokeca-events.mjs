// ポケモンカード公式イベント (players.pokemon-card.com の公開JSON API)
// 「参加すると特別な商品が買える/もらえる大会」だけを抽出する。
// robots.txtは存在せず、認証・特殊ヘッダも不要(2026-07実測)。
import { fetchText, clean, sleep, ALLOWED_REGIONS } from './../util.mjs';

const BASE = 'https://players.pokemon-card.com';
const DAYS_AHEAD = 45;
const DETAIL_BUDGET = 25; // 1回の実行で詳細を取りにいく上限(タイトル単位)

// 対象地域(店頭受取と同じ範囲) → 都道府県コード
const PREF_CODES = {
  埼玉: 11, 千葉: 12, 東京: 13, 神奈川: 14, 滋賀: 25, 京都: 26, 大阪: 27, 愛媛: 38,
};

// 参加費にカード商品の購入が含まれる = 大会に出ると買える(ドリンク付き等は対象外)
const BUYABLE = /(パック|BOX|ボックス|カード|デッキ|商品)[^。]{0,14}(購入費|購入代金|購入分|の購入)|(購入費|購入代金)[^。]{0,10}(含|込)/;
// 商品性が高いイベント名(通常のジムバトル・月例大会は対象外)
const SPECIAL_TITLE = /ゲットバトル|発売記念|新弾記念|先行(販売|体験|プレイ)|シールド戦|プレリリース|チャンピオンシップ|バトルフェスタ|フェスタ|購入.*大会|大会.*購入/;
// 賞品テキストに「特別な商品」が含まれるか(単なる参加賞プロモは除く強めの語)
const PRIZE_GOODS = /BOX|ボックス|未開封|限定(カード|プロモ|グッズ|商品)|SAR|UR|スペシャル|特別な(カード|プロモ)|カードセット|パック\s*\d+\s*パック/;

export async function scrape() {
  const today = new Date();
  const start = fmt(today);
  const end = fmt(new Date(today.getTime() + DAYS_AHEAD * 86400000));

  const raw = [];
  for (const [pref, code] of Object.entries(PREF_CODES)) {
    if (!ALLOWED_REGIONS.has(pref)) continue;
    try {
      const url = `${BASE}/event_search?offset=0&limit=500&order=1&start_date=${start}&end_date=${end}&prefecture[]=${code}`;
      const json = JSON.parse(await fetchText(url, { headers: { Accept: 'application/json' } }));
      for (const e of json.event || []) raw.push(e);
    } catch (err) {
      console.error(`[pokeca-events] ${pref} 失敗: ${err.message}`);
    }
    await sleep(1200);
  }
  if (!raw.length) return [];

  // 候補を絞る(全ジムバトルを載せると一覧が埋まるため、特典が見込めるものだけ)
  const candidates = raw.filter(
    (e) =>
      BUYABLE.test(e.entry_fee || '') ||
      SPECIAL_TITLE.test(e.event_title || '') ||
      e.event_type === 1 || // 大型大会
      (e.event_type === 7 && !/ジムバトル|フリー対戦|交流会|体験会/.test(e.event_title || '')) // シールド戦/その他
  );

  // 詳細(参加賞)はタイトル単位で1回だけ取得して使い回す(同一タイトルは賞品も同一)
  const prizeByTitle = new Map();
  let budget = DETAIL_BUDGET;
  for (const e of candidates) {
    const t = e.event_title;
    if (prizeByTitle.has(t) || budget <= 0) continue;
    budget--;
    prizeByTitle.set(t, await fetchPrize(e));
    await sleep(900);
  }

  const items = [];
  const seen = new Set();
  for (const e of candidates) {
    const prize = prizeByTitle.get(e.event_title) || null;
    const buyable = BUYABLE.test(e.entry_fee || '') || (prize ? BUYABLE.test(prize) : false);
    const hasGoods = prize ? PRIZE_GOODS.test(prize) : false;
    // 「特別な商品が買える/もらえる」ものだけ掲載(賞品不明の通常大会は載せない)
    if (!buyable && !hasGoods && !SPECIAL_TITLE.test(e.event_title || '')) continue;

    const pref = (e.prefecture_name || '').replace(/[都道府県]$/, '');
    // 同じ大会が毎日開催される場合は最も近い日程だけを掲載し、残りは件数で示す
    const key = `${e.event_title}|${e.shop_name}`;
    if (seen.has(key)) {
      const first = items.find((x) => x.__key === key);
      if (first) first.more_dates = (first.more_dates || 0) + 1;
      continue;
    }
    seen.add(key);

    const detailUrl = `${BASE}/event/detail/${e.event_holding_id}/${e.trainers_flg ?? 1}/${e.shop_id}/${e.event_date_params}/${e.date_id}`;
    items.push({
      __key: key,
      kind: 'event',
      title: clean(e.event_title).slice(0, 70),
      product: null,
      game: 'pokeca',
      retailer: clean(e.shop_name || '').slice(0, 30) || 'ポケモンカードジム',
      platform: 'store',
      regions: pref ? [pref] : [],
      apply_url: detailUrl,
      apply_kind: 'direct',
      source: 'pokeca-events',
      source_url: detailUrl,
      deadline: isoDate(e.event_date_params), // 開催日
      event_at: `${isoDate(e.event_date_params)}${e.event_started_at ? 'T' + e.event_started_at : ''}`,
      venue: clean(e.address || '').slice(0, 60) || null,
      perk: [buyable ? `参加費に商品購入を含む: ${clean(e.entry_fee)}` : null, prize ? `賞品: ${prize}` : null]
        .filter(Boolean)
        .join(' / ')
        .slice(0, 220),
      conditions: [
        e.entry_fee ? `参加費 ${clean(e.entry_fee)}` : null,
        e.capacity ? `定員${e.capacity}名` : null,
        e.regulation ? `レギュ:${clean(e.regulation)}` : null,
        prize ? `賞品: ${prize}` : null,
      ]
        .filter(Boolean)
        .join(' / ')
        .slice(0, 260),
    });
  }
  for (const it of items) delete it.__key;
  console.log(`[pokeca-events] 候補${candidates.length}件 → 特典あり${items.length}件(詳細取得 ${DETAIL_BUDGET - budget}件)`);
  return items;
}

async function fetchPrize(e) {
  try {
    const url = `${BASE}/event_detail_search?event_holding_id=${e.event_holding_id}&trainers_flg=${e.trainers_flg ?? 1}&shop_id=${e.shop_id}&event_date=${e.event_date_params}&date_id=${e.date_id}`;
    const d = JSON.parse(await fetchText(url, { retries: 1, headers: { Accept: 'application/json' } }));
    const text = [d.prize, d.orgEventGoods, d.orgEventDetail].filter(Boolean).join(' / ');
    return text ? clean(text).slice(0, 200) : null;
  } catch {
    return null;
  }
}

function fmt(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
function isoDate(yyyymmdd) {
  const s = String(yyyymmdd || '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}
