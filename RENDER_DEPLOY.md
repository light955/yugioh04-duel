# Render公開手順

## 1. GitHubへアップロード

このプロジェクトのファイルをGitHubリポジトリへアップロードします。

アップロードしないもの:

- `node_modules`フォルダー
- `.git`フォルダー
- `.env`で始まる秘密設定ファイル
- `*.log`ログファイル

リポジトリ直下に、次のファイルがあることを確認してください。

- `render.yaml`
- `package.json`
- `package-lock.json`
- `server.js`
- `metaverse.html`

## 2. Renderへ接続

1. Renderへログインします。
2. Dashboardの`New`から`Blueprint`を選びます。
3. GitHubのゲーム用リポジトリを接続します。
4. Renderがリポジトリ直下の`render.yaml`を検出したことを確認します。
5. `Apply`を押してデプロイを開始します。

`render.yaml`には次の設定を保存済みです。

- Node.js Web Service
- Singaporeリージョン
- Freeプラン
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check: `/health`
- GitHub更新時の自動デプロイ

## 3. 公開後の確認

Renderが発行した`https://...onrender.com`を開きます。

1. タイトル画面が表示される
2. 名前を入力してロビーへ入れる
3. HUDが`ONLINE`になる
4. 別のブラウザでも開き、お互いのアバターと名前が表示される
5. 座標と向きが同期する

Freeプランでは、アクセスがない時間が続くとサーバーが休止します。休止後の最初のアクセスは、起動まで少し待つことがあります。

公式資料:

- https://render.com/docs/infrastructure-as-code
- https://render.com/docs/websocket
- https://render.com/docs/free
