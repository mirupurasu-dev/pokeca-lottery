// ポケモン公式 NEWS配信 JSON API (認証不要・robots許可確認済)
import { fetchText } from './../util.mjs';

const API = 'https://www.pokemon.co.jp/api/info/index/';

export async function scrape() {
  const items = [];
  for (const page of [1, 2]) {
    const raw = await fetchText(`${API}?page=${page}`, { headers: { Accept: 'application/json' } });
    const json = JSON.parse(raw);
    for (const r of json.results || []) {
      if (!['card', 'pokecen'].includes(r.term)) continue;
      const text = `${r.title || ''} ${r.txt_1 || ''}`;
      if (!/抽選/.test(text)) continue;
      const url = r.full_uniq || r.uniq;
      if (!url) continue;
      // ポケセンオンライン/店舗のnewsは専用アダプタが担当するので除外
      if (/pokemoncenter-online\.com|shop\.pokemon\.co\.jp/.test(url)) continue;
      items.push({
        title: r.title.slice(0, 90),
        product: null,
        retailer: 'ポケモン公式ニュース',
        platform: 'online',
        regions: [],
        apply_url: url,
        source: 'pokemon.co.jp',
        source_url: url,
        deadline: null,
        conditions: r.txt_1 || null,
      });
    }
  }
  return items;
}
