// X(Twitter)の抽選告知 — Yahoo!リアルタイム検索のSSR(__NEXT_DATA__)経由
// robots.txt: /realtime/search は非Disallow(確認済)。実行ごと2クエリのみの低頻度アクセス。
import * as cheerio from 'cheerio';
import { fetchText, clean, extractRegions } from './../util.mjs';
import { loadProducts } from './../products.mjs';

const QUERIES = [
  { q: 'ポケカ 抽選販売', game: 'pokeca' },
  { q: 'ポケモンカード 抽選 受付', game: 'pokeca' },
  { q: 'ポケカ 店頭抽選', game: 'pokeca' },
  { q: 'ワンピカード 抽選販売', game: 'onepiece' },
  { q: 'ワンピースカード 抽選 受付', game: 'onepiece' },
];

// X告知が主体のショップの指名ウォッチ(店名で検索し、抽選ツイートだけ拾う)
// 追加したい店はここに1行足すだけ(q=検索語, shop=表示名, regions=都道府県)
const SHOP_WATCH = [
  { q: '元気302 抽選', shop: 'ゲームプラザ元気302', regions: ['滋賀'], platform: 'store' },
];
const MAX_AGE_DAYS = 5;

// フォロー&リポスト系プレゼント企画・アフィリエイトを除外
const NOISE = /フォロー\s*[&＆]\s*(リポスト|RT|リツイート)|プレゼント企画|抽選で\d+名様|アマギフ|Amazonギフト|招待コード|ポイ活/;

export async function scrape() {
  const items = [];
  const seen = new Set();

  for (const { q, game } of QUERIES) {
    for (const t of await searchTweets(q, seen)) {
      const { text } = t;
      if (!/販売|応募|受付|実施/.test(text)) continue;
      items.push(tweetToItem(t, { game }));
    }
  }

  for (const w of SHOP_WATCH) {
    for (const t of await searchTweets(w.q, seen)) {
      const game = detectGame(t.text);
      if (!game) continue; // トレカと無関係なツイート(在庫botの雑音等)は捨てる
      items.push(tweetToItem(t, { game, retailer: w.shop, regions: w.regions, platform: w.platform }));
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
    if (NOISE.test(text)) continue;
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

function tweetToItem(t, { game, retailer, regions, platform }) {
  const tweetUrl = `https://x.com/${t.screenName}/status/${t.id}`;
  const ext = (t.urls || []).map((u) => u.expandedUrl).find((u) => u && !/x\.com|twitter\.com/.test(u));
  const isStore = platform === 'store' || /店頭|店舗|ご来店|来店|整理券/.test(t.text);
  return {
    title: t.text.slice(0, 70) + (t.text.length > 70 ? '…' : ''),
    game,
    product: null,
    retailer: retailer || clean(t.name || t.screenName).slice(0, 24),
    platform: isStore ? 'store' : 'online',
    regions: regions || extractRegions(t.text),
    apply_url: ext || tweetUrl,
    source: 'x',
    source_url: tweetUrl,
    deadline: null,
    conditions: 'X投稿由来・詳細は投稿元で確認',
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
