# 無限ゴーレム工房 UNLIMITED GOLEM WORKS

ゴーレムがゴーレムを作る工房を組み、最初に無限ループを完成させた人が勝つ拡大再生産ボードゲームのブラウザ版です。

- 遊ぶ：https://cceight.github.io/golem-works/
- ソロ、CPU戦、オンライン対戦（最大5人、合言葉で部屋に入る）に対応しています。

## 構成

- `index.html`：ゲーム本体（GitHub Pagesで公開）
- `worker/`：オンライン対戦の中継サーバー（Cloudflare Workers + Durable Objects）
  - 部屋を作った人のブラウザがホストとしてゲームを進め、サーバーはメッセージを中継するだけです。
  - `main` ブランチの `worker/` が変わると、GitHub Actionsが自動でCloudflareに公開します。
  - 必要なリポジトリシークレット：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`

ローカルで試すときは、`worker/` で `npx wrangler dev` を起動し、`index.html?server=ws://127.0.0.1:8787` を開きます。
