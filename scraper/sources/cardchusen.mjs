// カード抽選まとめ (cardchusen.com) — 最大の横断ソース。ポケカ+ワンピの2ページを巡回。
// robots.txt: Allow / (確認済 2026-07-20)。1日3回の低頻度アクセスのみ。
import * as cheerio from 'cheerio';
import { fetchText, clean, sleep, ROMAJI_PREF } from './../util.mjs';

const PAGES = [
  { url: 'https://cardchusen.com/pokeka', game: 'pokeca', strip: /^ポケモンカード(ゲーム)?\s*/ },
  { url: 'https://cardchusen.com/onepiece', game: 'onepiece', strip: /^ワンピース\s*カード(ゲーム)?\s*|^ONE\s*PIECEカードゲーム\s*/i },
];

export async function scrape() {
  const items = [];
  for (const page of PAGES) {
    try {
      items.push(...(await scrapePage(page)));
    } catch (e) {
      console.error(`[cardchusen] ${page.game} 失敗: ${e.message}`);
    }
    await sleep(2000);
  }
  return items;
}

async function scrapePage({ url, game, strip }) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const items = [];
  const now = new Date();

  $('article.board-row').each((_, el) => {
    const e = $(el);
    const type = e.attr('data-lottery-type'); // online | store
    const end = e.attr('data-entry-end') || null; // ISO+09:00
    if (end && new Date(end) < now) return; // 締切済みは除外
    const product = clean(e.find('.board-row__product').text());
    const store = clean(e.find('.board-row__store').text()).replace(/・\s*(ポケカ|ワンピ)$/, '').trim();
    if (!product || !store) return;

    const areas = (e.attr('data-area') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((a) => ROMAJI_PREF[a])
      .filter(Boolean);

    let applyUrl = e.find('a.board-btn--apply').attr('href') || null;
    if (!applyUrl) applyUrl = e.find('button[data-cta-url]').attr('data-cta-url') || null;
    const packSlug = (e.attr('data-pack') || '').split(/\s+/)[0];
    const infoUrl = packSlug ? `${url}/${packSlug}` : url;

    const conds = e.find('.board-cond__txt').map((_, c) => clean($(c).text())).get();
    const methodNote = e.find('button[data-method-open]').attr('data-method-label') || '';

    items.push({
      title: product.replace(strip, ''),
      product,
      game,
      retailer: store,
      platform: type === 'store' ? 'store' : 'online',
      regions: areas,
      apply_url: applyUrl || infoUrl,
      source: 'cardchusen',
      source_url: infoUrl,
      deadline: end ? end.replace('+09:00', '') : null,
      conditions: [conds.join('・'), methodNote].filter(Boolean).join(' / ') || null,
    });
  });
  return items;
}
