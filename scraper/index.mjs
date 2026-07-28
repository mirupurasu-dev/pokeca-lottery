// ポケカ抽選レーダー: 収集オーケストレーター
// 各ソースアダプタを実行 → 既存データとマージ → 地域フィルタ → 相場結合 → docs/data/data.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha1, nowJst, storeRegionOk, extractRegions, extractCondTags } from './util.mjs';
import { enrichConditions } from './enrich.mjs';
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

// (条件タグ抽出は util.mjs の extractCondTags を使用)

// まとめサイト/SNSは「実際の応募画面」ではない → apply_kind='info' としてUIでボタンを分ける
const INFO_DOMAINS = ['cardchusen.com', 'nyuka-now.com', 'pokechuu.com', 'pokecawatch.com',
  'snkrdunk.com', 'x.com', 'twitter.com', 'gamenv.net', 'torecamap.co.jp'];

function classifyApply(url, hint) {
  if (hint) return hint;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (INFO_DOMAINS.some((d) => h === d || h.endsWith('.' + d))) return 'info';
  } catch {
    return 'info';
  }
  return 'direct';
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
    kind: raw.kind === 'event' ? 'event' : 'lottery',
    game: raw.game || 'pokeca',
    cond_tags: extractCondTags(condText),
    title: raw.title.slice(0, 120),
    product,
    ...(raw.kind === 'event'
      ? { perk: raw.perk || null, venue: raw.venue || null, event_at: raw.event_at || null, more_dates: raw.more_dates || 0 }
      : {}),
    product_key: matchProduct(`${raw.title} ${raw.product || ''}`),
    retailer,
    platform: storeish ? 'store' : 'online',
    regions,
    apply_url,
    apply_kind: classifyApply(apply_url, raw.apply_kind),
    source: raw.source || adapterName,
    source_url: raw.source_url || apply_url,
    deadline: raw.deadline || null,
    conditions: raw.conditions || null,
  };
}

// ソース間デデュープ: 同一商品×同一販売元を1件に統合(情報の濃いソースを優先)
const SOURCE_PRIORITY = ['cardchusen', 'pokemon-center', 'pokemon-center-online', 'pokemon.co.jp',
  'kidsrepublic', 'itoyokado', 'rakuten-books', 'yodobashi', 'hmv', 'nyuka-now', 'x'];

// 表記ゆれを吸収する販売元の正規化(同じ店が別名で二重掲載されるのを防ぐ)
const RETAILER_ALIASES = [
  [/girafull|ジラフル/i, 'ジラフル'],
  [/tsutaya|ツタヤ/i, 'TSUTAYA'],
  [/geo|ゲオ/i, 'GEO'],
  [/yellowsubmarine|イエローサブマリン|イエサブ/i, 'イエローサブマリン'],
  [/dragonstar|ドラゴンスター/i, 'ドラゴンスター'],
  [/hobbystation|ホビーステーション|ホビステ/i, 'ホビーステーション'],
  [/hareruya|晴れる屋/i, '晴れる屋2'],
  [/furuichi|古本市場|ふるいち/i, 'ふるいち'],
  [/wondergoo|新星堂/i, '新星堂/WonderGOO'],
  [/joshin|ジョーシン|上新/i, 'ジョーシン'],
  [/kojima|コジマ/i, 'コジマ'],
  [/nojima|ノジマ/i, 'ノジマ'],
  [/yodobashi|ヨドバシ/i, 'ヨドバシカメラ'],
  [/bic\s*camera|ビックカメラ/i, 'ビックカメラ'],
  [/edion|エディオン/i, 'エディオン'],
  [/familymart|ファミマ|ファミリーマート/i, 'ファミマオンライン'],
  [/lawson|ローソン/i, 'ローソン'],
  [/amazon|アマゾン/i, 'Amazon'],
  [/rakuten|楽天/i, '楽天ブックス'],
  [/pokemoncenter|ポケモンセンター|ポケセン/i, 'ポケモンセンター'],
  [/mugiwara|麦わらストア/i, '麦わらストア'],
  [/kidyland|キデイランド/i, 'キデイランド'],
  [/seagull|シーガル/i, 'シーガル'],
  [/gamearc|ゲームアーク|宝島/i, 'ゲームアーク/宝島'],
  [/oretan|オレタン/i, 'オレタン'],
];

export function canonRetailer(name) {
  const s = name || '';
  for (const [re, canon] of RETAILER_ALIASES) {
    if (re.test(s)) return canon;
  }
  return s
    .replace(/[（(].*?[)）]/g, '')
    .replace(/各店|通販|オンライン|ネット|店頭|ストア|[\s・/／()（）]/g, '')
    .toLowerCase();
}

function dedupeKey(it) {
  if (it.kind === 'event') return `event|${it.game}|${it.title}|${canonRetailer(it.retailer)}`;
  const prod = it.product_key || (it.title || '').slice(0, 20);
  return `${it.game}|${prod}|${canonRetailer(it.retailer)}`;
}

function mergeInto(prev, it) {
  const pa = SOURCE_PRIORITY.indexOf(prev.source);
  const pb = SOURCE_PRIORITY.indexOf(it.source);
  const [win, lose] = (pb !== -1 && (pa === -1 || pb < pa)) ? [it, prev] : [prev, it];
  // 欠けている情報は負けた方から補完
  if (!win.deadline && lose.deadline) win.deadline = lose.deadline;
  if ((!win.regions || !win.regions.length) && lose.regions?.length) win.regions = lose.regions;
  if (!win.conditions && lose.conditions) win.conditions = lose.conditions;
  if (!win.product_key && lose.product_key) win.product_key = lose.product_key;
  if ((!win.cond_tags || !win.cond_tags.length) && lose.cond_tags?.length) win.cond_tags = lose.cond_tags;
  // 直接応募URLを持つ方を必ず優先(まとめページ行きを回避)
  if (win.apply_kind !== 'direct' && lose.apply_kind === 'direct') {
    win.apply_url = lose.apply_url;
    win.apply_kind = 'direct';
  }
  return win;
}

function dedupe(items) {
  // 第1段: 応募URLが同じなら同一案件(店名の表記ゆれに関係なく確実に統合)
  const byUrl = new Map();
  const out = [];
  for (const it of items) {
    const u = normUrl(it.apply_url);
    // まとめ/SNSページのURLは案件ごとに同じになるので統合キーにしない
    if (!u || it.apply_kind !== 'direct') {
      out.push(it);
      continue;
    }
    const prev = byUrl.get(u);
    byUrl.set(u, prev ? mergeInto(prev, it) : it);
  }
  out.push(...byUrl.values());

  // 第2段: 同一ゲーム×商品×販売元(正規化)で統合
  const byKey = new Map();
  for (const it of out) {
    const key = dedupeKey(it);
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergeInto(prev, it) : it);
  }
  return [...byKey.values()];
}

function normUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'ref_']) url.searchParams.delete(p);
    return url.origin + url.pathname.replace(/\/$/, '') + url.search;
  } catch {
    return null;
  }
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
    // X由来は毎回取り直す(古い投稿・判定基準の変更前データを引きずらない)
    if (old.source === 'x') continue;
    const dl = old.deadline ? new Date(old.deadline.length <= 10 ? old.deadline + 'T23:59:00+09:00' : old.deadline) : null;
    const lastSeen = old.last_seen ? new Date(old.last_seen) : now;
    // 締切済みは1日だけ(結果待ちの確認用)、締切不明は元ソースから消えて7日で落とす
    const keepUntil = dl ? dl.getTime() + 1 * 86400000 : lastSeen.getTime() + 7 * 86400000;
    if (keepUntil > now.getTime()) byId.set(id, old);
  }

  // 店頭受取の地域フィルタ(首都圏/大阪/京都/滋賀/愛媛のみ。地域不明の全国チェーンは残す)
  let items = [...byId.values()].filter((it) => it.platform !== 'store' || storeRegionOk(it.regions));
  // 大会は開催日が過ぎたら落とす
  const todayStr = nowJst().slice(0, 10);
  items = items.filter((it) => it.kind !== 'event' || !it.deadline || it.deadline >= todayStr);

  // 応募ページの中にしか書かれていない条件(◯円以上購入等)を実フェッチで補完
  let enrichCache = prev.enrich || {};
  try {
    enrichCache = await enrichConditions(items, enrichCache);
  } catch (e) {
    errors.push(`enrich: ${e.message}`);
  }

  // 相場結合
  let products = prev.products || {};
  try {
    products = await fetchMarketPrices(loadProducts(), products);
  } catch (e) {
    errors.push(`resale: ${e.message}`);
    console.error(`[resale] FAILED: ${e.message}`);
  }

  items.sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1);
  const out = { updated_at: nowJst(), items, products, enrich: enrichCache, errors };
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(out, null, 1));
  console.log(`\n合計 ${items.length}件 (エラー ${errors.length}ソース) → ${DATA_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
