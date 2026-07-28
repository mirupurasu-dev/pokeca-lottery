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
      // 専用アダプタが落ちた場合の保険として、ポケセン系の告知もここで拾う
      // (デデュープで専用アダプタ版が優先されるため重複はしない)
      const isPokecenOnline = /pokemoncenter-online\.com/.test(url);
      const isPokecenStore = /shop\.pokemon\.co\.jp/.test(url);
      items.push({
        title: r.title.slice(0, 90),
        product: null,
        retailer: isPokecenOnline
          ? 'ポケモンセンターオンライン'
          : isPokecenStore
            ? 'ポケモンセンター(店頭)'
            : 'ポケモン公式ニュース',
        platform: isPokecenStore ? 'store' : 'online',
        regions: [],
        apply_url: isPokecenOnline ? 'https://www.pokemoncenter-online.com/lottery/apply.html' : url,
        apply_kind: 'info',
        source: 'pokemon.co.jp',
        source_url: url,
        deadline: null,
        conditions: r.txt_1 || null,
      });
    }
  }
  return items;
}
