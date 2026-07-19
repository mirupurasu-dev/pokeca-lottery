// 楽天ブックス ポケカ抽選受付ページ (EUC-JP・受付中はページが書き換わる)
import * as cheerio from 'cheerio';
import { fetchTextAs, clean, parseJpRangeEnd } from './../util.mjs';

const URL = 'https://books.rakuten.co.jp/event/game/card/entry/';

export async function scrape() {
  const html = await fetchTextAs(URL, 'euc-jp');
  const body = clean(cheerio.load(html)('body').text());
  if (/受付は終了|次回の受付は未定/.test(body)) return [];
  if (!/抽選/.test(body)) return [];

  const period = body.match(/抽選受付期間[^。]{0,80}/)?.[0] || '';
  return [
    {
      title: '楽天ブックス ポケモンカードゲーム 抽選販売 受付中',
      product: null,
      retailer: '楽天ブックス',
      platform: 'online',
      regions: [],
      apply_url: URL,
      source: 'rakuten-books',
      source_url: URL,
      deadline: parseJpRangeEnd(period),
      conditions: '楽天会員・当選後オンライン購入(配送)',
    },
  ];
}
