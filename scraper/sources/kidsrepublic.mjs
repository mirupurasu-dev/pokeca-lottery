// イオン キッズリパブリック キャンペーン一覧 (Next.js SSR・イオンのポケカ抽選唯一のWeb告知)
import * as cheerio from 'cheerio';
import { fetchText, clean, absUrl, parseJpRangeEnd } from './../util.mjs';

const LIST = 'https://www.kidsrepublic.jp/campaign/';

export async function scrape() {
  const html = await fetchText(LIST, { timeoutMs: 40000 });
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  const links = [];
  $('a[href*="/campaign/campaign_detail/"]').each((_, a) => {
    const title = clean($(a).text());
    const url = absUrl($(a).attr('href'), LIST);
    if (!/ポケモンカード|ポケカ/.test(title)) return;
    if (/終了/.test(title)) return;
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ title, url });
  });

  for (const l of links.slice(0, 3)) {
    let deadline = null;
    try {
      const body = clean(cheerio.load(await fetchText(l.url, { timeoutMs: 40000 }))('body').text());
      const periods = body.match(/(?:応募期間|応募受付期間|申込期間)[^。]{0,80}/g) || [];
      for (const p of periods) {
        const d = parseJpRangeEnd(p);
        if (d && (!deadline || d > deadline)) deadline = d;
      }
    } catch {
      // 詳細失敗でも一覧から掲載
    }
    items.push({
      title: l.title.slice(0, 90),
      product: null,
      retailer: 'イオン(キッズリパブリック)',
      platform: 'store',
      regions: [],
      apply_url: l.url,
      source: 'kidsrepublic',
      source_url: l.url,
      deadline,
      conditions: 'キッズリパブリックアプリで応募(iAEON連携)・当選後は店頭購入',
    });
  }
  return items;
}
