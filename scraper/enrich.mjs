// 応募ページ(Googleフォーム/LivePocket)を実フェッチして、そこにしか書かれていない
// 応募条件(「◯円以上購入」等)を抜き出す。結果はURL単位でキャッシュし、毎回は叩かない。
import { fetchText, clean, sleep, extractCondTags } from './util.mjs';

const TARGET = /docs\.google\.com\/forms|forms\.gle|t\.livepocket\.jp\/e\//;
const MAX_FETCH_PER_RUN = 12;
const CACHE_DAYS = 21;

// 条件らしき文を抜き出す(金額条件・購入実績・会員/本人確認まわり)
const SNIPPET_RE =
  /[^。\n]{0,25}(?:[0-9][0-9,．.]*\s*万?\s*円[^。\n]{0,12}以上|購入(?:履歴|実績|条件|金額)|お買い上げ|レシート|会員(?:限定|登録)|本人確認|身分証|(?:1人|お一人|おひとり)様?\s*[0-9１-９]+\s*(?:回|口|点|BOX)|重複応募|二重応募)[^。\n]{0,45}/g;

export async function enrichConditions(items, prevCache = {}) {
  const now = Date.now();
  const cache = {};
  // 生きているキャッシュだけ引き継ぐ
  for (const [url, e] of Object.entries(prevCache)) {
    if (now - new Date(e.as_of).getTime() < CACHE_DAYS * 86400000) cache[url] = e;
  }

  let budget = MAX_FETCH_PER_RUN;
  for (const it of items) {
    if (!TARGET.test(it.apply_url || '')) continue;
    let entry = cache[it.apply_url];
    if (!entry && budget > 0) {
      budget--;
      entry = { snippet: await fetchSnippet(it.apply_url), as_of: new Date(now).toISOString() };
      cache[it.apply_url] = entry;
      await sleep(1500);
    }
    if (entry?.snippet) {
      if (!it.conditions || !it.conditions.includes(entry.snippet.slice(0, 20))) {
        it.conditions = [it.conditions, `応募ページ記載: ${entry.snippet}`].filter(Boolean).join(' / ').slice(0, 320);
      }
      it.cond_tags = extractCondTags(`${it.conditions} ${it.title} ${it.retailer}`);
    }
  }
  const done = items.filter((i) => TARGET.test(i.apply_url || '') && cache[i.apply_url]?.snippet).length;
  console.log(`[enrich] 応募ページ由来の条件を ${done}件に付与 (今回フェッチ ${MAX_FETCH_PER_RUN - budget}件)`);
  return cache;
}

async function fetchSnippet(url) {
  try {
    const html = await fetchText(url, { retries: 1, timeoutMs: 15000 });
    // タグ除去した全文から条件文を拾う(Googleフォームは説明文がHTML内JSONにも入るが全文grepで足りる)
    const text = clean(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, (m) => (/FB_PUBLIC_LOAD_DATA_/.test(m) ? m : ' '))
        .replace(/\\n|\\u000a/g, ' ')
        .replace(/<[^>]+>/g, ' ')
    );
    const found = [...new Set((text.match(SNIPPET_RE) || []).map((s) => clean(s)))];
    if (!found.length) return null;
    return found.slice(0, 2).join(' / ').slice(0, 170);
  } catch {
    return null;
  }
}
