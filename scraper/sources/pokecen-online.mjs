// ポケモンセンターオンラインの抽選告知 (トップページお知らせ欄 → news詳細)
import * as cheerio from 'cheerio';
import { fetchText, clean, parseJpRangeEnd } from './../util.mjs';

const BASE = 'https://www.pokemoncenter-online.com';

export async function scrape() {
  const html = await fetchText(BASE + '/');
  const $ = cheerio.load(html);
  const items = [];

  const notices = [];
  $('.noticeBox a, .noticeUl li a').each((_, a) => {
    const text = clean($(a).text());
    const href = $(a).attr('href') || '';
    if (/抽選/.test(text) && href.includes('/news/')) {
      notices.push({ text, url: BASE + href });
    }
  });

  for (const n of notices.slice(0, 3)) {
    let deadline = null;
    try {
      const detail = await fetchText(n.url);
      const body = clean(cheerio.load(detail)('main').text());
      const periods = body.match(/(?:応募期間|応募受付期間|受付期間|申込期間)[^。]{0,80}/g) || [];
      for (const p of periods) {
        const d = parseJpRangeEnd(p);
        if (d && (!deadline || d > deadline)) deadline = d;
      }
    } catch {
      // 詳細が取れなくても告知として掲載
    }
    items.push({
      title: n.text.replace(/^\d{4}年\d{2}月\d{2}日\s*/, '').slice(0, 90),
      product: null,
      retailer: 'ポケモンセンターオンライン',
      platform: 'online',
      regions: [],
      apply_url: BASE + '/lottery/apply.html',
      source: 'pokemon-center-online',
      source_url: n.url,
      deadline,
      conditions: '会員ログイン後「抽選応募一覧」から応募(本人確認あり)',
    });
  }
  return items;
}
