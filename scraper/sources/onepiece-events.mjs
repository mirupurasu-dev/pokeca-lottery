// ONE PIECEカードゲーム公式イベント (onepiece-cardgame.com/events/)
// 会場物販でBOXが買えるイベント・参加記念品がもらえるイベントを抽出。
// robots.txt は存在しない(2026-07実測)。全国キャンペーン単位のため地域は付かない。
import * as cheerio from 'cheerio';
import { fetchText, clean, absUrl, sleep, parseJpDate } from './../util.mjs';

const LIST = 'https://www.onepiece-cardgame.com/events/';
const BUY = /会場物販|販売価格|1BOX|1ボックス|会場販売|物販/;
const PERK = /参加記念品|参加賞|プロモーションパック|プロモカード|特製|抽選会|限定/;
const MAX_DETAIL = 10;

export async function scrape() {
  const html = await fetchText(LIST);
  const $ = cheerio.load(html);
  const cards = [];
  $('a.linkCard').each((_, a) => {
    const el = $(a);
    cards.push({
      url: absUrl(el.attr('href'), LIST),
      title: clean(el.find('.linkCardTitle').text()) || clean(el.find('h4').first().text()),
      date: clean(el.find('.linkCardDate').text()),
      lead: clean(el.find('.linkCardTxt').text()),
      tags: el.find('.linkCardTag span').map((_, s) => clean($(s).text())).get(),
    });
  });

  const items = [];
  for (const c of cards.slice(0, MAX_DETAIL)) {
    if (!c.title) continue;
    let body = '';
    try {
      body = clean(cheerio.load(await fetchText(c.url))('body').text());
      await sleep(1200);
    } catch {
      // 詳細が取れなくても一覧情報で判定を試みる
    }
    const text = `${c.title} ${c.lead} ${body}`;
    const buyable = BUY.test(text);
    const perk = PERK.test(text);
    if (!buyable && !perk) continue;

    // 会場物販の価格を抜き出す(例: 1BOX：5,760円(税込))
    const priceM = body.match(/1\s*BOX[^0-9]{0,8}([0-9,]{3,})\s*円/);
    const goodsM = body.match(/参加記念品[^。]{0,90}/);

    items.push({
      kind: 'event',
      title: c.title.slice(0, 70),
      product: null,
      game: 'onepiece',
      retailer: '公認店舗(全国)',
      platform: 'store',
      regions: [],
      apply_url: c.url,
      apply_kind: 'direct',
      source: 'onepiece-events',
      source_url: c.url,
      deadline: parseEventDate(c.date),
      event_at: parseEventDate(c.date),
      venue: null,
      perk: [
        buyable ? `会場物販あり${priceM ? `: 1BOX ¥${priceM[1]}` : ''}` : null,
        goodsM ? clean(goodsM[0]) : perk ? '参加記念品あり' : null,
      ]
        .filter(Boolean)
        .join(' / ')
        .slice(0, 220),
      conditions: [c.date, c.tags.join('・'), c.lead].filter(Boolean).join(' / ').slice(0, 260),
    });
  }
  console.log(`[onepiece-events] 一覧${cards.length}件 → 特典あり${items.length}件`);
  return items;
}

// 「2026年8月1日(土)・2日(日)」→ 最初の日付
function parseEventDate(s) {
  if (!s) return null;
  const m = s.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  return parseJpDate(s);
}
