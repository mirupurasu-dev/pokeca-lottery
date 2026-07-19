// カード抽選まとめ (cardchusen.com/pokeka) — 最大の横断ソース
// robots.txt: Allow / (確認済 2026-07-20)。1日3回の低頻度アクセスのみ。
import * as cheerio from 'cheerio';
import { fetchText, clean, ROMAJI_PREF } from './../util.mjs';

const URL = 'https://cardchusen.com/pokeka';

export async function scrape() {
  const html = await fetchText(URL);
  const $ = cheerio.load(html);
  const items = [];
  const now = new Date();

  $('article.board-row').each((_, el) => {
    const e = $(el);
    const type = e.attr('data-lottery-type'); // online | store
    const end = e.attr('data-entry-end') || null; // ISO+09:00
    if (end && new Date(end) < now) return; // 締切済みは除外
    const product = clean(e.find('.board-row__product').text());
    const store = clean(e.find('.board-row__store').text()).replace(/・\s*ポケカ$/, '').trim();
    if (!product || !store) return;

    const areas = (e.attr('data-area') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((a) => ROMAJI_PREF[a])
      .filter(Boolean);

    let applyUrl = e.find('a.board-btn--apply').attr('href') || null;
    if (!applyUrl) applyUrl = e.find('button[data-cta-url]').attr('data-cta-url') || null;
    const packSlug = (e.attr('data-pack') || '').split(/\s+/)[0];
    const infoUrl = packSlug ? `https://cardchusen.com/pokeka/${packSlug}` : URL;

    const conds = e.find('.board-cond__txt').map((_, c) => clean($(c).text())).get();
    const methodNote = e.find('button[data-method-open]').attr('data-method-label') || '';

    items.push({
      title: product.replace(/^ポケモンカード(ゲーム)?\s*/, ''),
      product,
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
