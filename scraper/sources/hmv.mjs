// HMV&BOOKS グッズニュース (Shift_JIS・ブラウザUA必須) — HMV店頭抽選の告知
import * as cheerio from 'cheerio';
import { fetchTextAs, clean, extractRegions, parseJpRangeEnd } from './../util.mjs';

const BASE = 'https://www.hmv.co.jp';
const LIST = `${BASE}/news/top/4/`;

export async function scrape() {
  const html = await fetchTextAs(LIST, 'shift_jis');
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  const articles = [];
  $('a[href^="/news/article/"]').each((_, a) => {
    const text = clean($(a).text());
    const href = $(a).attr('href');
    if (!/ポケモンカード|ポケカ/.test(text) || !/抽選/.test(text)) return;
    if (seen.has(href)) return;
    seen.add(href);
    articles.push({ title: text.split('...')[0].slice(0, 90), url: BASE + href });
  });

  for (const art of articles.slice(0, 2)) {
    let deadline = null;
    let regions = [];
    try {
      const body = clean(cheerio.load(await fetchTextAs(art.url, 'shift_jis'))('body').text());
      const periods = body.match(/(?:応募期間|応募受付期間|エントリー期間)[^。]{0,80}/g) || [];
      for (const p of periods) {
        const d = parseJpRangeEnd(p);
        if (d && (!deadline || d > deadline)) deadline = d;
      }
      regions = extractRegions(body);
    } catch {
      // 一覧情報のみで掲載
    }
    // 締切が過去の記事(旧回の告知)は載せない
    if (deadline && new Date(deadline + '+09:00') < new Date()) continue;
    items.push({
      title: art.title,
      product: null,
      retailer: 'HMV(店頭)',
      platform: 'store',
      regions,
      apply_url: art.url,
      source: 'hmv',
      source_url: art.url,
      deadline,
      conditions: 'HMV店頭抽選・詳細は記事参照',
    });
  }
  return items;
}
