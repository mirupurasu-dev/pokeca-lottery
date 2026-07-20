// X(Twitter)の抽選告知 — Yahoo!リアルタイム検索のSSR(__NEXT_DATA__)経由
// robots.txt: /realtime/search は非Disallow(確認済)。実行ごと2クエリのみの低頻度アクセス。
import * as cheerio from 'cheerio';
import { fetchText, clean, extractRegions } from './../util.mjs';

const QUERIES = [
  { q: 'ポケカ 抽選販売', game: 'pokeca' },
  { q: 'ポケモンカード 抽選 受付', game: 'pokeca' },
  { q: 'ワンピカード 抽選販売', game: 'onepiece' },
  { q: 'ワンピースカード 抽選 受付', game: 'onepiece' },
];
const MAX_AGE_DAYS = 5;

// フォロー&リポスト系プレゼント企画・アフィリエイトを除外
const NOISE = /フォロー\s*[&＆]\s*(リポスト|RT|リツイート)|プレゼント企画|抽選で\d+名様|アマギフ|Amazonギフト|招待コード|ポイ活/;

export async function scrape() {
  const items = [];
  const seen = new Set();

  for (const { q, game } of QUERIES) {
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
      continue;
    }

    for (const t of entries) {
      if (!t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      const text = clean((t.displayText || '').replace(/\tSTART\t|\tEND\t/g, ''));
      if (!/抽選/.test(text)) continue;
      if (!/販売|応募|受付|実施/.test(text)) continue;
      if (NOISE.test(text)) continue;
      if (t.createdAt && Date.now() / 1000 - t.createdAt > MAX_AGE_DAYS * 86400) continue;

      const tweetUrl = `https://x.com/${t.screenName}/status/${t.id}`;
      const ext = (t.urls || []).map((u) => u.expandedUrl).find((u) => u && !/x\.com|twitter\.com/.test(u));
      const isStore = /店頭|店舗|ご来店|来店|整理券/.test(text);
      items.push({
        title: text.slice(0, 70) + (text.length > 70 ? '…' : ''),
        game,
        product: null,
        retailer: clean(t.name || t.screenName).slice(0, 24),
        platform: isStore ? 'store' : 'online',
        regions: extractRegions(text),
        apply_url: ext || tweetUrl,
        source: 'x',
        source_url: tweetUrl,
        deadline: null,
        conditions: 'X投稿由来・詳細は投稿元で確認',
      });
    }
  }
  return items;
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
