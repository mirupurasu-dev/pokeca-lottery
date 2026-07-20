// ポケモンセンター実店舗の店頭事前抽選 (shop.pokemon.co.jp のお知らせフラグメント)
import * as cheerio from 'cheerio';
import { fetchText, clean, parseJpRangeEnd } from './../util.mjs';

const BASE = 'https://shop.pokemon.co.jp';
const LIST = `${BASE}/ja/shop/common/news-list.html`;

// 店舗カタカナ名 → 都道府県
const STORE_PREF = {
  'サッポロ': '北海道', 'トウホク': '宮城', 'スカイツリー': '東京', 'シブヤ': '東京',
  'メガトウキョー': '東京', 'トウキョーDX': '東京', 'トウキョーベイ': '千葉', 'ヨコハマ': '神奈川',
  'ナゴヤ': '愛知', 'カナザワ': '石川', 'キョウト': '京都', 'オーサカ': '大阪', 'ヒロシマ': '広島',
  'カガワ': '香川', 'フクオカ': '福岡', 'オキナワ': '沖縄',
};

export async function scrape() {
  const frag = await fetchText(LIST);
  const $ = cheerio.load(frag);
  const items = [];

  const articles = [];
  $('li a[href]').each((_, a) => {
    const title = clean($(a).find('.c-news-list__title').text());
    if (/抽選/.test(title) && /ポケモンカード|ポケカ/.test(title)) {
      articles.push({ title, url: BASE + $(a).attr('href') });
    }
  });

  for (const art of articles.slice(0, 3)) {
    let deadline = null;
    let regions = [];
    let body = '';
    try {
      const html = await fetchText(art.url);
      const $$ = cheerio.load(html);
      body = clean($$('main').text() || $$('body').text());
      // 「お申し込み期間」「応募期間」の最後の範囲の終端を締切とする
      const periods = body.match(/(?:申し?込み?期間|応募期間|受付期間)[^。]{0,80}/g) || [];
      for (const p of periods) {
        const d = parseJpRangeEnd(p);
        if (d && (!deadline || d > deadline)) deadline = d;
      }
      for (const [name, pref] of Object.entries(STORE_PREF)) {
        if (body.includes(name) && !regions.includes(pref)) regions.push(pref);
      }
    } catch {
      // 詳細取得失敗でも一覧情報だけで載せる
    }
    items.push({
      title: art.title.slice(0, 90),
      product: null,
      retailer: 'ポケモンセンター(店頭)',
      platform: 'store',
      regions,
      apply_url: art.url,
      apply_kind: 'info',
      source: 'pokemon-center',
      source_url: art.url,
      deadline,
      conditions: /モギリー|LINE/.test(body) ? 'LINEミニアプリ「モギリーLite」で応募・応募リンクは期間開始後に各店舗ページ掲載' : null,
    });
  }
  return items;
}
