// 入荷Now まとめ記事 (nyuka-now.com/archives/2459) — アプリ/店頭のみ告知のGMS系を補完
// robots.txt: 記事パス許可(確認済)。1日3回のみ・出典明記。
import * as cheerio from 'cheerio';
import { fetchText, clean, extractRegions, parseJpDate } from './../util.mjs';

const URL = 'https://nyuka-now.com/archives/2459';

export async function scrape() {
  const html = await fetchText(URL);
  const $ = cheerio.load(html);
  const items = [];

  // 「抽選・予約応募受付中のストア」h2 配下の h3 ブロックのみを対象
  let inSection = false;
  $('h2, h3').each((_, el) => {
    const tag = el.tagName;
    const text = clean($(el).text());
    if (tag === 'h2') {
      inSection = /抽選・予約応募受付中/.test(text);
      return;
    }
    if (!inSection || tag !== 'h3') return;

    const store = text;
    // h3直後から次のh2/h3までを1ブロックとして走査
    const fields = {};
    const links = [];
    let productList = [];
    let node = $(el).next();
    while (node.length && !/^h[23]$/.test(node[0].tagName)) {
      node.find('tr').each((_, tr) => {
        const th = clean($(tr).find('th').first().text());
        const td = $(tr).find('td').first();
        if (!th) return;
        if (th === '対象商品') {
          const lis = td.find('li').map((_, li) => clean($(li).text())).get();
          productList = lis.length ? lis : [clean(td.text())];
        }
        fields[th] = clean(td.text());
      });
      node.find('a[href]').each((_, a) => links.push($(a).attr('href')));
      node = node.next();
    }

    const productText = productList.join(' / ');
    if (!productText) return;
    const form = fields['抽選形式'] || '';
    // 受取が店頭なら store 扱い(当選者には店頭販売、を含む)
    const isStore = /店頭|店舗/.test(form);
    const deadlineRaw = fields['終了日'] || '';
    const dDate = parseJpDate(deadlineRaw);
    const tm = deadlineRaw.match(/(\d{1,2}):(\d{2})/);
    const external = links.find((u) => u && !u.includes('nyuka-now.com') && /^https?:/.test(u));

    items.push({
      title: productList.map((p) => p.replace(/^ポケモンカード(ゲーム)?\s*/, '')).join(' / ').slice(0, 70),
      product: productText.slice(0, 100),
      retailer: store,
      platform: isStore ? 'store' : 'online',
      regions: extractRegions(store + ' ' + (fields['応募条件'] || '')),
      apply_url: external || URL,
      source: 'nyuka-now',
      source_url: URL,
      deadline: dDate ? (tm ? `${dDate}T${String(+tm[1]).padStart(2, '0')}:${tm[2]}` : dDate) : null,
      conditions: fields['応募条件'] ? clean(fields['応募条件']).slice(0, 90) : null,
    });
  });
  return items;
}
