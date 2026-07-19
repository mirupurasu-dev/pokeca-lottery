# ポケカ抽選レーダー

日本のポケモンカード抽選販売情報を毎日自動収集して一覧表示する静的サイト。

- **サイト**: https://mirupurasu-dev.github.io/pokeca-lottery/
- 応募ページ(フォーム/応募ボタン)への直リンク付き
- 店頭受取系は首都圏(1都3県)・大阪・京都・滋賀の対象案件のみ掲載
- BOX相場(買取最高値ベース)から還元率(定価比)を推定表示
- GitHub Actions で毎日3回(JST 7:00 / 12:00 / 19:00)自動更新

## 仕組み

```
scraper/index.mjs        オーケストレーター(収集→デデュープ→地域フィルタ→相場結合)
scraper/sources/*.mjs    ソース別アダプタ(11本)
scraper/resale.mjs       BOX相場のライブ取得(JSON-LD)
scraper/products.mjs     商品マスタ(定価・別名正規表現)
docs/                    GitHub Pages (スマホ最適化・単一HTML)
docs/data/data.json      収集結果(Actionsがコミットで更新)
```

## 情報源

| 種別 | ソース |
|---|---|
| 横断まとめ | cardchusen.com / nyuka-now.com |
| 公式(ポケセン) | pokemoncenter-online.com / shop.pokemon.co.jp / pokemon.co.jp API |
| 小売公式 | イオン(kidsrepublic) / イトーヨーカドー / 楽天ブックス / ヨドバシ / HMV |
| X(Twitter) | Yahoo!リアルタイム検索経由 |
| 相場 | pokeca-box-hikaku.com(買取最高値) |

各ソースは1日3回のみの低頻度アクセス・失敗時は前回データを保持。

## 開発

```bash
npm install
npm run scrape   # docs/data/data.json を再生成
npm run serve    # http://localhost:4811
```

## 免責

非公式のまとめサイトです。応募条件・期間は必ずリンク先の公式ページで確認してください。相場は市場価格からの推定値であり保証しません。
