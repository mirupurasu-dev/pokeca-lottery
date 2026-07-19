import crypto from 'node:crypto';

export const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export async function fetchText(url, opts = {}) {
  const { retries = 2, timeoutMs = 20000, headers = {} } = opts;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'ja,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers,
        },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

// 全都道府県 → 短縮名
export const PREFS = [
  '北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川',
  '新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫',
  '奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎',
  '熊本','大分','宮崎','鹿児島','沖縄',
];

// 表示対象地域(店頭受取): 首都圏(一都三県) + 大阪・滋賀・京都
export const ALLOWED_REGIONS = new Set(['東京', '神奈川', '埼玉', '千葉', '大阪', '滋賀', '京都']);

// 主要都市名 → 都道府県 (ショップ店舗名からの地域推定用)
export const CITY_PREF = {
  '札幌': '北海道', '仙台': '宮城', '宇都宮': '栃木', '高崎': '群馬', '大宮': '埼玉', '川口': '埼玉',
  '柏': '千葉', '船橋': '千葉', '秋葉原': '東京', '新宿': '東京', '池袋': '東京', '渋谷': '東京',
  '立川': '東京', '町田': '東京', '横浜': '神奈川', '川崎': '神奈川', '金沢': '石川', '新潟市': '新潟',
  '浜松': '静岡', '名古屋': '愛知', '大須': '愛知', '京都市': '京都', '梅田': '大阪', '難波': '大阪',
  '高槻': '大阪', '天王寺': '大阪', '神戸': '兵庫', '三宮': '兵庫', '姫路': '兵庫', '岡山市': '岡山',
  '広島市': '広島', '高松': '香川', '松山': '愛媛', '博多': '福岡', '小倉': '福岡', '那覇': '沖縄',
  '大津': '滋賀', '草津': '滋賀',
};

// テキストから都道府県を抽出(都市名からの推定含む)
export function extractRegions(text) {
  if (!text) return [];
  const found = new Set();
  for (const p of PREFS) {
    if (text.includes(p)) found.add(p);
  }
  if (/都内|東京都/.test(text)) found.add('東京');
  if (/大阪府/.test(text)) found.add('大阪');
  if (/京都府/.test(text)) found.add('京都');
  if (/滋賀県/.test(text)) found.add('滋賀');
  for (const [city, pref] of Object.entries(CITY_PREF)) {
    if (text.includes(city)) found.add(pref);
  }
  return [...found];
}

// 店頭受取アイテムの表示可否: 対象地域を1つでも含む、または地域不明(全国チェーン等)なら表示
export function storeRegionOk(regions) {
  if (!regions || regions.length === 0) return true;
  return regions.some((r) => ALLOWED_REGIONS.has(r));
}

// 「7月25日」「2026年7月25日」「7/25」等をISO日付に(年は前後3ヶ月ウィンドウで推定)
export function parseJpDate(text, base = new Date()) {
  if (!text) return null;
  const m =
    text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/) ||
    text.match(/(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  const m2 = text.match(/(\d{1,2})月\s*(\d{1,2})日/) || text.match(/(\d{1,2})\/(\d{1,2})/);
  if (m2) {
    const mo = +m2[1], d = +m2[2];
    let y = base.getFullYear();
    const cand = new Date(y, mo - 1, d);
    // 4ヶ月以上過去なら来年、8ヶ月以上未来なら去年とみなす
    const diff = (cand - base) / 86400000;
    if (diff < -120) y += 1;
    else if (diff > 240) y -= 1;
    return iso(y, mo, d);
  }
  return null;
}

function iso(y, mo, d) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function nowJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00');
}

export function absUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

export function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

// ローマ字都道府県スラッグ → 日本語短縮名 (cardchusenのdata-area用)
export const ROMAJI_PREF = {
  hokkaido: '北海道', aomori: '青森', iwate: '岩手', miyagi: '宮城', akita: '秋田', yamagata: '山形',
  fukushima: '福島', ibaraki: '茨城', tochigi: '栃木', gunma: '群馬', saitama: '埼玉', chiba: '千葉',
  tokyo: '東京', kanagawa: '神奈川', niigata: '新潟', toyama: '富山', ishikawa: '石川', fukui: '福井',
  yamanashi: '山梨', nagano: '長野', gifu: '岐阜', shizuoka: '静岡', aichi: '愛知', mie: '三重',
  shiga: '滋賀', kyoto: '京都', osaka: '大阪', hyogo: '兵庫', nara: '奈良', wakayama: '和歌山',
  tottori: '鳥取', shimane: '島根', okayama: '岡山', hiroshima: '広島', yamaguchi: '山口',
  tokushima: '徳島', kagawa: '香川', ehime: '愛媛', kochi: '高知', fukuoka: '福岡', saga: '佐賀',
  nagasaki: '長崎', kumamoto: '熊本', oita: '大分', miyazaki: '宮崎', kagoshima: '鹿児島', okinawa: '沖縄',
};

// charset付きフェッチ(EUC-JP/Shift_JIS対応)
export async function fetchTextAs(url, charset, opts = {}) {
  const { retries = 2, timeoutMs = 20000, headers = {} } = opts;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8', ...headers },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = await res.arrayBuffer();
      return new TextDecoder(charset).decode(buf);
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

// 「7月22日(水)14:00〜7月24日(金)23:59」等の範囲から終端をISO化
export function parseJpRangeEnd(text, base = new Date()) {
  if (!text) return null;
  const m = text.match(
    /[〜～~][^0-9]{0,12}(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日[^0-9]{0,8}(\d{1,2})[:時](\d{2})?/
  );
  if (m) {
    const d = parseJpDate(`${m[1] ? m[1] + '年' : ''}${m[2]}月${m[3]}日`, base);
    if (d) return `${d}T${String(+m[4]).padStart(2, '0')}:${m[5] || '00'}`;
  }
  const m2 = text.match(/[〜～~][^0-9]{0,12}(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日/);
  if (m2) return parseJpDate(`${m2[1] ? m2[1] + '年' : ''}${m2[2]}月${m2[3]}日`, base);
  return null;
}
