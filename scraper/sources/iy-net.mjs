// イトーヨーカドーネット通販 抽選一覧 (抽選なし時は固定文言、開催時は apply_*.aspx が生える)
import * as cheerio from 'cheerio';
import { fetchText, clean, absUrl, parseJpRangeEnd } from './../util.mjs';

const LIST = 'https://iyec.itoyokado.co.jp/shop/e/eE4reslot/';

export async function scrape() {
  const html = await fetchText(LIST);
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('a[href*="apply_"]').each((_, a) => {
    const url = absUrl($(a).attr('href'), LIST);
    if (seen.has(url)) return;
    seen.add(url);
    const title = clean($(a).text()) || 'イトーヨーカドー ネット通販 抽選販売';
    if (!/ポケモン|ポケカ/.test(title + url) && !/pomega|poke/i.test(url)) return;
    items.push({
      title: title.slice(0, 90),
      product: null,
      retailer: 'イトーヨーカドー(ネット通販)',
      platform: 'online',
      regions: [],
      apply_url: url,
      source: 'itoyokado',
      source_url: LIST,
      deadline: parseJpRangeEnd(clean($(a).closest('div,li,td').text())),
      conditions: '当選後ネット通販で購入・配送',
    });
  });
  return items;
}
