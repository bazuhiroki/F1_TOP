# セットアップ手順（初回だけ・約20分）

## 1. Notion：インテグレーションを作る
1. https://www.notion.so/profile/integrations →「新しいインテグレーション」→ 種類は「内部」
2. 表示されたトークン（`ntn_...`）をコピー
3. Notionで「F1 HQ」ページを開き、右上「…」→「接続」→ 作ったインテグレーションを追加
4. 「F1ニュース・アーカイブ」DBにも同じく接続を追加（F1 HQの外にあるため）

## 2. GitHub：自動同期を動かす
1. このリポジトリの Settings → Secrets and variables → Actions → New repository secret
   - Name: `NOTION_TOKEN` / Secret: 手順1のトークン
2. Actions タブ →「Notion Sync (Jolpica → Notion)」→ Run workflow → 緑になればOK

## 3A. Vercel：Webアプリを公開する（無料・おすすめ）
1. https://vercel.com →「Sign Up」→ **Continue with GitHub**（Hobbyプラン＝無料）
2. ダッシュボード →「Add New…」→「Project」→ `F1_TOP` の「Import」
3. 設定はそのまま（`vercel.json` が自動で読まれます）
   - Framework Preset: Other
   - Output Directory: `web`
4. 「Environment Variables」に2つ追加
   - `NOTION_TOKEN` … 手順1のトークン
   - `APP_KEY` … 自分で決める合言葉
5. 「Deploy」→ 1分ほどで `https://f1-top-xxxx.vercel.app` が発行されます
6. 以後は GitHub に push するたびに自動で再デプロイされます
   ※ 環境変数を後から変えた場合は Deployments →「…」→「Redeploy」

## 3B. Cloudflare Pages：Webアプリを公開する（無料・代替）
1. https://dash.cloudflare.com にサインアップ（無料プラン）
2. Workers & Pages → 作成 → **Pages** → 「Gitに接続」→ GitHubを連携して `F1_TOP` を選択
3. ビルド設定
   - フレームワーク: なし
   - ビルドコマンド: 空欄
   - ビルド出力ディレクトリ: `web`
4. 「保存してデプロイ」
5. デプロイ後、プロジェクトの 設定 → 変数とシークレット に以下を**シークレット**として追加
   - `NOTION_TOKEN` … 手順1のトークン
   - `APP_KEY` … 自分で決める合言葉（長めがおすすめ）
6. デプロイ → 最新デプロイの「…」→「再試行」（シークレットを反映させるため）

## 4. 使い始める
1. `https://f1-top.pages.dev`（表示されたURL）を開く
2. 設定 → 合言葉（APP_KEY）を入力 →「接続する」
3. スマホは共有メニューから「ホーム画面に追加」

## うまくいかないとき
| 症状 | 対処 |
|---|---|
| 「合言葉が違います」 | Cloudflareの APP_KEY と同じ文字列か確認。変更後は再デプロイが必要 |
| 「Notionの読み込みに失敗」 | 手順1-3/1-4の接続漏れ。特にニュースDB |
| 「サーバー関数が見つかりません」 | GitHub Pages など Cloudflare 以外で開いている。F1データは表示されるがNotion連携は動かない |
| 順位が古い | Jolpicaはレース後数時間〜1日で更新。アプリは5分キャッシュ |

## コスト
- Cloudflare Pages：無料枠（関数は1日10万リクエストまで）。個人利用なら上限に届きません
- GitHub Actions：公開リポジトリは無料
- Jolpica-F1 / Notion API：無料
