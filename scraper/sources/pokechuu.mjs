// ポケチュー まとめ (pokechuu.com) — カバレッジ補完用。
// 「現在応募できるポケカBOX抽選一覧」直下の <li><strong>店名「商品」</strong> ... 応募URL を拾う。
import * as cheerio from 'cheerio';
import { fetchText, clean, parseJpDate, extractRegions } from './../util.mjs';

const URL = 'https://pokechuu.com/pokemon-card-box-lottery-2026/';

export async function scrape() {
  const html = await fetchText(URL);
  const $ = cheerio.load(html);
  const items = [];

  const h = $('h2').filter((_, e) => /現在応募できる/.test($(e).text())).first();
  if (!h.length) {
    console.error('[pokechuu] 見出し「現在応募できる」が見つからない(構造変更の可能性)');
    return items;
  }

  // 見出し直後から次のh2までの間にある最上位<li>が1案件
  let node = h.next();
  while (node.length && node[0].tagName !== 'h2') {
    node.filter('ul').children('li').each((_, li) => {
      const el = $(li);
      const head = clean(el.children('strong').first().text());
      if (!head) return;
      const body = clean(el.text());
      // 店名「商品」形式を分解
      const m = head.match(/^(.+?)\s*[「『]([^」』]+)[」』]/);
      const retailer = clean(m ? m[1] : head).replace(/など$/, '');
      const product = m ? m[2] : null;
      if (!retailer) return;

      const applyUrl = el
        .find('a[href^="http"]')
        .map((_, a) => $(a).attr('href'))
        .get()
        .find((u) => !/pokechuu\.com|appollo\.jp/.test(u));

      items.push({
        title: product || head.slice(0, 60),
        product,
        game: 'pokeca',
        retailer: retailer.slice(0, 30),
        platform: /店頭|店舗|各店/.test(body) ? 'store' : 'online',
        regions: extractRegions(body),
        apply_url: applyUrl || URL,
        apply_kind: applyUrl ? 'direct' : 'info',
        source: 'pokechuu',
        source_url: URL,
        deadline: parseDeadline(body),
        conditions: clean(body.replace(head, '')).slice(0, 180) || null,
      });
    });
    node = node.next();
  }
  return items;
}

function parseDeadline(text) {
  const m = text.match(/(?:〜|～|~|まで)[^0-9]{0,6}(\d{1,2}月\s*\d{1,2}日)/) || text.match(/締切[^0-9]{0,6}(\d{1,2}月\s*\d{1,2}日)/);
  return m ? parseJpDate(m[1]) : null;
}
