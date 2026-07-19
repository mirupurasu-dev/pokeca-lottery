// リセール相場: ポケカ買取チェッカー(pokeca-box-hikaku.com)のJSON-LD(ItemList/Product)から
// 買取価格レンジをライブ取得。失敗時は前回値→商品マスタのシード値の順でフォールバック。
import * as cheerio from 'cheerio';
import { fetchText, nowJst } from './util.mjs';

const SRC_URL = 'https://pokeca-box-hikaku.com/';

export async function fetchMarketPrices(catalog, prevProducts = {}) {
  const products = {};
  // シード値で初期化
  for (const p of catalog) {
    products[p.key] = {
      name: p.name,
      msrp: p.msrp,
      market: p.market_seed || null,
      market_source: p.market_seed ? `${p.seed_src}(参考値)` : null,
      market_url: null,
      as_of: p.market_seed ? '調査時点' : null,
    };
  }
  // 前回のライブ値があれば引き継ぐ(シードより新しい)
  for (const [k, v] of Object.entries(prevProducts)) {
    if (products[k] && v.live) products[k] = v;
  }

  let live = 0;
  try {
    const html = await fetchText(SRC_URL);
    const $ = cheerio.load(html);
    const entries = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        collectProducts(JSON.parse($(el).html()), entries);
      } catch {
        // 壊れたJSON-LDは無視
      }
    });
    for (const { name, high } of entries) {
      if (!name || !high) continue;
      for (const p of catalog) {
        if (p.re.test(name)) {
          products[p.key] = {
            name: p.name,
            msrp: p.msrp,
            market: high,
            market_source: 'ポケカ買取チェッカー(買取最高値)',
            market_url: SRC_URL,
            as_of: nowJst(),
            live: true,
          };
          live++;
          break;
        }
      }
    }
    console.log(`[resale] JSON-LD ${entries.length}商品中 ${live}商品をマスタに反映`);
    if (entries.length === 0) throw new Error('JSON-LDにProductが見つからない(構造変更の可能性)');
  } catch (e) {
    console.error(`[resale] ライブ取得失敗(シード/前回値を使用): ${e.message}`);
  }
  return products;
}

function collectProducts(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectProducts(n, out);
    return;
  }
  if (node['@type'] === 'Product' && node.offers) {
    out.push({ name: node.name, high: +node.offers.highPrice || null });
  }
  for (const k of ['itemListElement', 'item', '@graph', 'mainEntity']) {
    if (node[k]) collectProducts(node[k], out);
  }
}
