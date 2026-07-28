// X(Twitter)の抽選告知 — Yahoo!リアルタイム検索のSSR(__NEXT_DATA__)経由
// robots.txt: /realtime/search は非Disallow(確認済)。実行ごと2クエリのみの低頻度アクセス。
import * as cheerio from 'cheerio';
import { fetchText, clean, extractRegions } from './../util.mjs';
import { loadProducts } from './../products.mjs';

const QUERIES = [
  { q: 'ポケカ 抽選販売', game: 'pokeca' },
  { q: 'ポケモンカード 抽選 受付', game: 'pokeca' },
  { q: 'ポケカ 店頭抽選', game: 'pokeca' },
  { q: '松山 ポケモンカード 抽選', game: 'pokeca' }, // 愛媛(松山)の店頭抽選: TSUTAYA平井/オレタン/フジ等
  { q: 'ワンピカード 抽選販売', game: 'onepiece' },
  { q: 'ワンピースカード 抽選 受付', game: 'onepiece' },
];

// X告知が主体のショップの指名ウォッチ(店名で検索し、抽選ツイートだけ拾う)
// 追加したい店はここに1行足すだけ(q=検索語, shop=表示名, regions=都道府県)
const SHOP_WATCH = [
  { q: '元気302 抽選', shop: 'ゲームプラザ元気302', regions: ['滋賀'], platform: 'store' },
  { q: 'オレタン松山 抽選', shop: 'オレタン松山店', regions: ['愛媛'], platform: 'store' },
];

// 当選報告・落選報告などファンのつぶやきを除外(告知だけ拾う)
const CHATTER = /当選し|当たった|アタタ|落ちた|落選|外れた|ハズレ|届いた|開封/;
const MAX_AGE_DAYS = 5;

// プレゼント企画・アフィリエイトを除外。
// 注意: フォロー&リポストは正規の店頭抽選の応募方式でもある(TSUTAYA系等)ため、
// 「抽選販売」を明記しているツイートは除外しない。
const NOISE = /プレゼント企画|抽選で\d+名様|名様にプレゼント|アマギフ|Amazonギフト|招待コード|ポイ活/;
const REPOST = /フォロー\s*[&＆]\s*(リポスト|RT|リツイート)/;

function isNoise(text) {
  if (NOISE.test(text)) return true;
  if (REPOST.test(text) && !/抽選販売|抽選受付/.test(text)) return true;
  return false;
}

// 告知ツイートだけを通す(感想・質問・リプライ・転売言及などの雑談を落とす)
function isAnnouncement(t) {
  const text = t.text;
  if (/^@|^RT\s/.test(text)) return false; // リプライ/RT
  if (/[?？]|どうする|どうなって|どう思|欲しい|ほしい|当たりたい|ご縁|羨ま|転売|ヤー|買えなかった|買えない/.test(text)) return false;
  // 受付・応募まわりの動詞があること
  if (!/(受付|応募|抽選販売|申込|申し込み)/.test(text)) return false;
  // 店名が本文にあれば告知とみなす。無い場合は期間・日付など告知の体裁を要求
  if (extractShop(text)) return true;
  return /\d{1,2}\s*[\/月]\s*\d{1,2}|期間|締切|〆|受付中|エントリー/.test(text);
}

// 1クエリあたり最新10件しか返らないため、現行商品名でもクエリを張って面を広げる
function productQueries() {
  const now = Date.now();
  return loadProducts()
    .filter((p) => {
      // 相場/抽選の対象になりやすい直近商品だけ(名前から抽出できる範囲で)
      return /BOX|ハイクラス|拡張パック|ブースターパック|スターター|デッキ/.test(p.name);
    })
    .slice(0, 8)
    .map((p) => {
      const short = p.name.match(/「([^」]+)」/)?.[1] || p.name.replace(/【[^】]*】/g, '').slice(0, 12);
      return { q: `${short} 抽選`, game: p.game || 'pokeca' };
    });
}

export async function scrape() {
  const items = [];
  const seen = new Set();

  for (const { q, game } of [...QUERIES, ...productQueries()]) {
    for (const t of await searchTweets(q, seen)) {
      if (!isAnnouncement(t)) continue;
      const it = tweetToItem(t, { game });
      if (it) items.push(it); // 店名が特定できない投稿は載せない(一覧のノイズ防止)
    }
  }

  for (const w of SHOP_WATCH) {
    for (const t of await searchTweets(w.q, seen)) {
      const game = detectGame(t.text);
      if (!game) continue; // トレカと無関係なツイート(在庫botの雑音等)は捨てる
      if (!isAnnouncement(t)) continue;
      if (CHATTER.test(t.text)) continue;
      // ツイート本文に別地域が明記されていればそちらを優先(他店舗の話題対策)
      const tweetRegions = extractRegions(t.text);
      const it = tweetToItem(t, {
        game,
        retailer: w.shop,
        regions: tweetRegions.length ? tweetRegions : w.regions,
        platform: w.platform,
      });
      if (it) items.push(it);
    }
  }
  return items;
}

async function searchTweets(q, seen) {
  let entries = [];
  try {
    const html = await fetchText(
      `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(q)}`
    );
    const nd = cheerio.load(html)('#__NEXT_DATA__').html();
    if (!nd) throw new Error('__NEXT_DATA__ not found (構造変更の可能性)');
    const tl = findTimeline(JSON.parse(nd), 0);
    entries = tl?.entry || [];
  } catch (e) {
    console.error(`[yahoo-realtime] "${q}" 失敗: ${e.message}`);
    return [];
  }
  const out = [];
  for (const t of entries) {
    if (!t.id || seen.has(t.id)) continue;
    const text = clean((t.displayText || '').replace(/\tSTART\t|\tEND\t/g, ''));
    if (!/抽選/.test(text)) continue;
    if (isNoise(text)) continue;
    if (t.createdAt && Date.now() / 1000 - t.createdAt > MAX_AGE_DAYS * 86400) continue;
    seen.add(t.id);
    out.push({ ...t, text });
  }
  return out;
}

// ツイート本文からゲームを判定(商品マスタとも突合)。どちらでもなければnull
function detectGame(text) {
  if (/ワンピ|ONE\s*PIECE/i.test(text)) return 'onepiece';
  if (/ポケ/.test(text)) return 'pokeca';
  const p = loadProducts().find((p) => p.re.test(text));
  return p ? (p.game || 'pokeca') : null;
}

// 店名として使えない語(速報アカ名・見出し断片・時刻表現など)
const BAD_SHOP_NAME = /^(お知らせ|抽選(販売)?(情報|のお知らせ)?|再販情報|入荷情報|速報|まとめ|本|当|同|各)?$|速報|情報まとめ|^\d|閉店|開店時|以下の|対象店|一部店|全店$/;

// ツイート本文から店名を抽出する。取れなければ null
function extractShop(text) {
  const pats = [
    /【([^【】]{2,28}?)(?:[｜|]|（|\()/, // 【ジラフル各店｜抽選受付】【TSUTAYA松山平井店（愛媛県）…】
    /【([^【】]{2,20}(?:各店|店|ストア|オンライン))】/, // 【○○各店】
    /([一-龥ぁ-んァ-ヶー][一-龥ぁ-んァ-ヶーa-zA-Z0-9&'’\s]{1,18}(?:各店|店|ストア|オンライン))(?:にて|では|さんにて|で|様)/,
    /([A-Za-z][A-Za-z0-9&'’\s]{2,18}(?:各店|店|ストア|オンライン))(?:にて|では|で)/, // TSUTAYA○○店にて
  ];
  for (const re of pats) {
    const m = text.match(re);
    if (!m) continue;
    const s = m[1]
      .replace(/(ポケカ|ワンピ(ース)?)?(カード)?(抽選販売|抽選受付|抽選|再販|入荷|予約)+$/, '')
      .replace(/^[｜|\s・、,]+/, '')
      .trim();
    if (s.length >= 3 && !BAD_SHOP_NAME.test(s)) return s.slice(0, 26);
  }
  return null;
}

function tweetToItem(t, { game, retailer, regions, platform }) {
  const tweetUrl = `https://x.com/${t.screenName}/status/${t.id}`;
  const ext = (t.urls || []).map((u) => u.expandedUrl).find((u) => u && !/x\.com|twitter\.com/.test(u));
  // 販売元の決め方:
  // ①明示指定 ②本文中の店名 ③店own告知(当店/フォロー&RP等)なら投稿者名 ④外部応募URLがあれば要確認扱い
  const selfPromo = /当店|弊店|当社|ご案内|フォロー\s*[&＆]|をフォロー|RP|リポスト|当日|ご来店/.test(t.text);
  const shop =
    retailer ||
    extractShop(t.text) ||
    (selfPromo ? clean(t.name || t.screenName).slice(0, 26) : null) ||
    (ext ? '(店舗はリンク先参照)' : null);
  if (!shop) return null;
  const isStore = platform === 'store' || /店頭|店舗|ご来店|来店|整理券|各店|店[（(]/.test(t.text);
  // 商品が特定できたら「商品名(店名)」形式にして、生ツイートをタイトルにしない
  const p = loadProducts().find((p) => p.re.test(t.text));
  const title = p
    ? `${p.name.replace(/^.*?「([^」]+)」.*$/, '$1').replace(/BOX$/, '').trim() || p.name}(${shop})`
    : t.text.slice(0, 70) + (t.text.length > 70 ? '…' : '');
  return {
    title,
    game,
    product: null,
    retailer: shop,
    platform: isStore ? 'store' : 'online',
    regions: regions || extractRegions(t.text),
    apply_url: ext || tweetUrl,
    source: 'x',
    source_url: tweetUrl,
    deadline: null,
    conditions: `X投稿由来・詳細は投稿元で確認 / ${clean(t.text).slice(0, 150)}`,
  };
}

function findTimeline(o, depth) {
  if (!o || typeof o !== 'object' || depth > 8) return null;
  if (o.timeline && o.timeline.entry) return o.timeline;
  for (const k of Object.keys(o)) {
    const r = findTimeline(o[k], depth + 1);
    if (r) return r;
  }
  return null;
}
