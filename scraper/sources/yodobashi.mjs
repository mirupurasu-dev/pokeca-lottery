// ヨドバシ 人気商品抽選ポータル (limited.yodobashi.com — 単一ページが書き換わる方式)
// データセンターIPからはブロックされる可能性あり(失敗時はスキップ)
import * as cheerio from 'cheerio';
import { fetchText, clean, parseJpRangeEnd } from './../util.mjs';

const URL = 'https://limited.yodobashi.com/';

export async function scrape() {
  const html = await fetchText(URL, { timeoutMs: 15000, retries: 1 });
  const body = clean(cheerio.load(html)('body').text());
  if (/終了いたしました|受付は終了/.test(body)) return [];
  if (!/抽選|お申し込み/.test(body)) return [];

  const period = body.match(/(?:申し?込み?期間|受付期間)[^。]{0,80}/)?.[0] || '';
  return [
    {
      title: 'ヨドバシ・ドット・コム 人気商品(ポケカ等)抽選販売 受付中',
      product: null,
      retailer: 'ヨドバシカメラ',
      platform: 'online',
      regions: [],
      apply_url: URL,
      source: 'yodobashi',
      source_url: URL,
      deadline: parseJpRangeEnd(period),
      conditions: 'ヨドバシ会員+購入履歴条件あり・受取は配送か店頭を選択',
    },
  ];
}
