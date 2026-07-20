// ポケカ抽選レーダー: 収集オーケストレーター
// 各ソースアダプタを実行 → 既存データとマージ → 地域フィルタ → 相場結合 → docs/data/data.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha1, nowJst, storeRegionOk, extractRegions } from './util.mjs';
import { matchProduct, loadProducts } from './products.mjs';
import { fetchMarketPrices } from './resale.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'docs', 'data', 'data.json');

async function loadAdapters() {
  const dir = path.join(__dirname, 'sources');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  const adapters = [];
  for (const f of files) {
    const mod = await import(path.join(dir, f));
    if (typeof mod.scrape === 'function') adapters.push({ name: f.replace('.mjs', ''), scrape: mod.scrape });
  }
  return adapters;
}

// 応募条件をタグ化(s=2:厳しめ / s=1:軽め)。UIでチップ表示・条件ゆるめフィルタに使う
const COND_RULES = [
  { re: /購入(履歴|実績|条件)|お買い上げ|レシート|利用実績/, t: '購入実績条件', s: 2 },
  { re: /本人確認|マイナンバー|身分証|顔写真|デジタル認証/, t: '本人確認あり', s: 2 },
  { re: /来店|店頭QR|店頭応募|店内|入店|整理券/, t: '来店必要', s: 2 },
  { re: /クレジットカード|クレカ/, t: 'クレカ必須', s: 2 },
  { re: /有料会員|プレミアム会員|ゴールド会員|プライム/, t: '有料会員限定', s: 2 },
  { re: /抽選申込.?参加券|クーポン提示/, t: '参加券必要', s: 2 },
  { re: /アプリ/, t: 'アプリ必須', s: 1 },
  { re: /LINE|モギリー/, t: 'LINE必要', s: 1 },
  { re: /フォロー|リポスト|リツイート/, t: 'Xフォロー等', s: 1 },
  { re: /1[89]歳以上|20歳以上|成人/, t: '年齢制限', s: 1 },
  { re: /会員|ログイン|ID登録/, t: '会員登録', s: 1 },
];

function extractCondTags(text) {
  const tags = [];
  for (const r of COND_RULES) {
    if (r.re.test(text)) tags.push({ t: r.t, s: r.s });
  }
  tags.sort((a, b) => b.s - a.s);
  return tags.slice(0, 4);
}

function normalize(raw, adapterName) {
  const apply_url = raw.apply_url || raw.source_url;
  if (!raw.title || !apply_url) return null;
  const id = sha1(`${raw.retailer}|${raw.title}|${apply_url}`);
  // 「各店」「店頭」を含む販売元は応募がWEBでも受取は店頭。
  // 通販でない実店舗名(地名入り)も店頭受取とみなす。
  const retailer = raw.retailer || adapterName;
  const isEcName = /通販|オンライン|ネット|ドット・?コム|EC/i.test(retailer);
  const shopRegions = isEcName ? [] : extractRegions(retailer);
  const storeish =
    raw.platform === 'store' || /各店|店頭/.test(retailer) || (!isEcName && shopRegions.length > 0);
  let regions = raw.regions || [];
  if (!regions.length && shopRegions.length) regions = shopRegions;
  // タイトルと実質同じ商品名は表示しない(カードの三重表示防止)
  let product = raw.product || null;
  if (product && raw.title.includes(product.replace(/^ポケモンカード(ゲーム)?\s*/, '').slice(0, 15))) product = null;
  const condText = `${raw.conditions || ''} ${raw.title} ${retailer}`;
  return {
    id,
    game: raw.game || 'pokeca',
    cond_tags: extractCondTags(condText),
    title: raw.title.slice(0, 120),
    product,
    product_key: matchProduct(`${raw.title} ${raw.product || ''}`),
    retailer,
    platform: storeish ? 'store' : 'online',
    regions,
    apply_url,
    source: raw.source || adapterName,
    source_url: raw.source_url || apply_url,
    deadline: raw.deadline || null,
    conditions: raw.conditions || null,
  };
}

// ソース間デデュープ: 同一商品×同一販売元を1件に統合(情報の濃いソースを優先)
const SOURCE_PRIORITY = ['cardchusen', 'pokemon-center', 'pokemon-center-online', 'pokemon.co.jp',
  'kidsrepublic', 'itoyokado', 'rakuten-books', 'yodobashi', 'hmv', 'nyuka-now', 'x'];

function dedupeKey(it) {
  const retailer = (it.retailer || '')
    .toLowerCase()
    .replace(/各店|通販|オンライン|ネット|店頭|ストア|[\s・/／()（）a-z0-9]/g, '');
  const sortedRetailer = [...retailer].sort().join('');
  const prod = it.product_key || (it.title || '').slice(0, 20);
  return `${it.game}|${prod}|${sortedRetailer}`;
}

function dedupe(items) {
  const byKey = new Map();
  for (const it of items) {
    const key = dedupeKey(it);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, it);
      continue;
    }
    const pa = SOURCE_PRIORITY.indexOf(prev.source);
    const pb = SOURCE_PRIORITY.indexOf(it.source);
    const [win, lose] = (pb !== -1 && (pa === -1 || pb < pa)) ? [it, prev] : [prev, it];
    // 欠けている情報は負けた方から補完
    if (!win.deadline && lose.deadline) win.deadline = lose.deadline;
    if ((!win.regions || !win.regions.length) && lose.regions?.length) win.regions = lose.regions;
    if (!win.conditions && lose.conditions) win.conditions = lose.conditions;
    byKey.set(key, win);
  }
  return [...byKey.values()];
}

async function main() {
  const prev = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) : { items: [], products: {} };
  const prevById = new Map((prev.items || []).map((i) => [i.id, i]));

  const adapters = await loadAdapters();
  const results = [];
  const errors = [];
  for (const a of adapters) {
    try {
      const items = await a.scrape();
      console.log(`[${a.name}] ${items.length}件`);
      results.push(...items.map((r) => normalize(r, a.name)).filter(Boolean));
    } catch (e) {
      errors.push(`${a.name}: ${e.message}`);
      console.error(`[${a.name}] FAILED: ${e.message}`);
    }
  }

  // マージ: 新規取得分 + 既存分(締切が未来 or 締切不明で14日以内に見たもの)は保持
  const deduped = dedupe(results);
  console.log(`デデュープ: ${results.length}件 → ${deduped.length}件`);
  const now = new Date();
  const byId = new Map();
  for (const it of deduped) {
    const old = prevById.get(it.id);
    byId.set(it.id, { ...it, first_seen: old?.first_seen || nowJst(), last_seen: nowJst() });
  }
  for (const [id, old] of prevById) {
    if (byId.has(id)) continue;
    const dl = old.deadline ? new Date(old.deadline.length <= 10 ? old.deadline + 'T23:59:00+09:00' : old.deadline) : null;
    const lastSeen = old.last_seen ? new Date(old.last_seen) : now;
    const keepUntil = dl ? dl.getTime() + 3 * 86400000 : lastSeen.getTime() + 14 * 86400000;
    if (keepUntil > now.getTime()) byId.set(id, old);
  }

  // 店頭受取の地域フィルタ(首都圏/大阪/京都/滋賀のみ。地域不明の全国チェーンは残す)
  let items = [...byId.values()].filter((it) => it.platform !== 'store' || storeRegionOk(it.regions));

  // 相場結合
  let products = prev.products || {};
  try {
    products = await fetchMarketPrices(loadProducts(), products);
  } catch (e) {
    errors.push(`resale: ${e.message}`);
    console.error(`[resale] FAILED: ${e.message}`);
  }

  items.sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1);
  const out = { updated_at: nowJst(), items, products, errors };
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(out, null, 1));
  console.log(`\n合計 ${items.length}件 (エラー ${errors.length}ソース) → ${DATA_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
