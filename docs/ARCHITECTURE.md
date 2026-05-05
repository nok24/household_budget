# アーキテクチャ

家族2人で使う家計簿Webアプリの構成と設計判断のまとめ。設計の経緯と「なぜそうしたか」を残す。

---

## 1. 全体像

```
┌───────────────────┐    fetch (cookie auth)    ┌────────────────────────┐
│ Cloudflare Pages  │ ─────────────────────────▶│  Pages Functions       │
│ (React SPA)       │                            │  /functions/api/*      │
│                   │ ◀─────────────────────────│  (Hono + drizzle)      │
└───────────────────┘                            │                        │
                                                 │  ┌──────────────────┐  │
                                                 │  │ Cloudflare D1    │  │
                                                 │  │ (SQLite)         │  │
                                                 │  └──────────────────┘  │
                                                 │                        │
                                                 │  Google Drive API ─────┼──▶ Drive
                                                 │  (refresh token in D1) │   (CSV取り込み専用)
                                                 └────────────────────────┘
```

- **フロント**: React + Vite。Pages にデプロイ。Drive 直接呼び出しはしない
- **バックエンド**: Pages Functions (`functions/api/[[path]].ts`) に Hono ルータ。Pages と同一オリジンなので CORS 不要
- **DB**: Cloudflare D1 (SQLite)。drizzle-orm で型安全に
- **Drive**: 1人の admin が一度だけ OAuth → refresh token を D1 に暗号化保存。以降のアクセスは Functions から
- **データソース**: マネーフォワード ME のエクスポート CSV を Drive の指定フォルダに置く運用は変えない

---

## 2. 設計判断の経緯

### 2.1 なぜ静的SPA を捨てたか

初期版は「ブラウザが直接 Drive を叩く」サーバ無し構成だった。これは2つの致命的問題を生んだ:

1. **デバイス間で共有が破綻**: `drive.file` スコープは OAuth グラント単位で動くため、PC で作った `budget.json` をスマホから書き換えると 403。フォールバックで同名ファイルが Drive に増えていく
2. **モバイルで毎回再認証**: iOS Safari の third-party cookie 制限で silent OAuth が失敗。トークンはメモリのみだったため、リロードで全消失

これらは「ブラウザだけで完結」の構造的限界。バックエンド経由に切り替えれば全部解決する。

### 2.2 Pages Functions vs Workers

両方とも Cloudflare 上の同等のランタイム。Pages Functions を選んだ理由:

- **同一オリジン**: Pages のフロントと cookie / CORS / CSRF 設計が一気に楽になる
- **デプロイ統合**: `git push` 一発でフロントとバックエンドが揃う
- **Workers にして得るものが無い**: Cron や複雑なルーティングは Pages Functions でも書ける

### 2.3 D1 vs KV

家計簿は集計クエリが本質 (月別合計、カテゴリ別累計、アンカーから残高推定など)。SQL のほうが圧倒的に楽。D1 は無料枠 (5M reads/day, 100K writes/day) で家庭利用なら十分。

### 2.4 Drive 接続主体は1人に集約

家族全員が個別に Drive を OAuth する案は、過去の問題と同じ罠 (グラント単位の権限分離) に戻る。admin (夫) 1人が refresh token を提供 → Functions が代理アクセス、というモデルが構造的に共有しやすい。

`drive.file` は使わず `drive.readonly` のみで運用。書き込み (`drive.file`) を使わなくなったので 403 問題そのものが消える。

### 2.5 オフライン非対応

家庭利用前提でモバイルもネット接続済み。ServiceWorker / IndexedDB キャッシュを抱える複雑度に見合うメリットが無い。

---

## 3. データモデル

### 3.1 D1 スキーマ概要

`functions/db/schema.ts` (drizzle) で定義。主要テーブル:

| テーブル            | 役割                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------ |
| `users`             | Google sub をPK、email allowlist 経由で作成                                          |
| `sessions`          | セッションID (256bit hex)、90日 TTL、HttpOnly cookie で配布                          |
| `app_settings`      | フォルダID、最終同期時刻などのKV                                                     |
| `encrypted_secrets` | Drive refresh token (AES-GCM)。`app_settings` と分離                                 |
| `transactions`      | MF CSV 取り込み後の取引。surrogate id + (source_file_id, mf_row_id) UNIQUE           |
| `overrides`         | 取引上書き (大項目/中項目/メモ/振替/集計除外)。`(source_file_id, mf_row_id)` 複合 PK |
| `members`           | 世帯メンバー定義                                                                     |
| `category_order`    | カテゴリ並び順                                                                       |
| `annual_budgets`    | カテゴリごとの年間予算                                                               |
| `account_anchors`   | 機関別残高アンカー                                                                   |
| `asset_snapshots`   | 資産推移CSV由来の月末スナップショット                                                |
| `csv_files`         | Drive 上の CSV ファイルメタ (差分同期用)                                             |
| `sync_log`          | 同期実行履歴。`status='running'` を重複実行ロックに兼用                              |

### 3.2 設計上のポイント

- **`transactions.id` は内部 surrogate**: MF の `id` 列は `mf_row_id` に分離。MF 側で再エクスポートして同じ ID が異なる行に振られても衝突しない
- **`overrides` の PK は `(source_file_id, mf_row_id)` 複合キー**: surrogate `transactions.id` を FK にすると、取引同期 (`source_file_id` 単位の DELETE+INSERT) で id が変わるたび override が孤立する。CSV 側の `mf_row_id` は安定しているのでこれと合わせて再リンクできる構造にした (PR-F)
- **`overrides.updated_by`**: 家族2人が触れるので、誰が変えたか監査用に持つ
- **`encrypted_secrets` を `app_settings` と分離**: 秘匿情報は別テーブルに隔離して、admin 操作の権限境界を明確にする

---

## 4. 認証・セキュリティ

### 4.1 ログインフロー

1. フロント: Google Identity Services で ID Token (`openid email profile` のみ) を取得
2. `POST /api/auth/login` に ID Token を渡す
3. Functions 側で検証:
   - `aud` = 自身の OAuth client_id に厳格一致
   - `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}
   - `email_verified === true`
   - `email` ∈ `ALLOWED_EMAILS` (env)
4. `users` に upsert、`sessions` に INSERT
5. `Set-Cookie: __Host-session=<id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7776000`

### 4.2 CSRF 対策

`SameSite=Lax` だけでは状態変更系 (POST/PUT/DELETE) で不十分。以下を必須化:

- **`Origin` または `Referer` ヘッダ**を検証 (許可: 自身の Pages ドメイン)
- 状態変更系は **`X-Requested-With: fetch` カスタムヘッダ**を要求 (cross-site `<form>` POST では送れない)

### 4.3 admin 判定

`ADMIN_EMAILS` env で定義 (例: `nok.24.eva.05@gmail.com`)。DB に `is_admin` を持たない理由は、誤って DB 書き換えで権限昇格できないようにするため。

### 4.4 Refresh token 暗号化

`encrypted_secrets` に AES-GCM で保管:

- **IV**: 暗号化のたびにランダム16B
- **Key**: Cloudflare Secrets (`wrangler secret put DRIVE_TOKEN_AES_KEY`) で管理
- **Key ID**: `key_id` 列にバージョンを記録 (将来のローテに備える)

Worker そのものが侵害された場合は実質的な防御にならないが、D1 ダンプ単独からの漏洩を防ぐ意味はある。

### 4.5 Drive 接続失敗時の挙動

refresh token は revoke / 6ヶ月 inactive で失効する。失敗時:

- `sync_log` に `error` で記録
- フロント上に「Drive未接続」バナー表示
- admin にだけ「再接続」ボタンを出す

---

## 5. データフロー

### 5.1 取引同期 (手動)

1. ユーザが「同期」ボタン押下 → `POST /api/sync/transactions`
2. Functions: `sync_log` に `status='running'` で INSERT (重複実行ロック)
3. Drive 上の家計簿フォルダの CSV 一覧を取得
4. `csv_files.modified_time` と比較して差分のみダウンロード
5. CSV パース → `transactions` に upsert
6. 不整合 (Drive 側から消えたファイル) は `transactions` から削除
7. `sync_log` を `status='success'` に更新

### 5.2 資産同期

家計簿同期と同じ流れだが、`asset_snapshots` は全置換 (MFの資産推移CSVは累積的に全期間入っているため)。

### 5.3 アンカーから残高推定

サーバ側 (`functions/lib/accountBalance.ts`) で計算。アルゴリズムは現行と同じ (アンカー月端から取引データの収支を遡って各月末の推定残高を作る)。クライアントは結果だけ受け取る。

純粋関数なのでフロント側にもコピーを残す (将来的にオフライン計算が必要になったとき or テスト容易性のため)。

---

## 6. 環境変数 / シークレット

### Pages (フロント) 環境変数

- `VITE_GOOGLE_CLIENT_ID`: Google OAuth クライアントID

### Pages Functions 環境変数

- `GOOGLE_CLIENT_ID`: 同上 (ID Token 検証用)
- `GOOGLE_CLIENT_SECRET`: Drive OAuth コールバック用 (admin 接続時)
- `ALLOWED_EMAILS`: ログイン許可メール (カンマ区切り)
- `ADMIN_EMAILS`: admin メール (カンマ区切り)
- `DRIVE_TOKEN_AES_KEY`: AES-GCM 256bit key (base64)。`wrangler secret put` で投入

### D1 binding

- `DB`: D1 database

---

## 7. デプロイ運用

- `git push` → GitHub → Cloudflare Pages が自動ビルド・デプロイ
- D1 マイグレーションは `npm run db:migrate` で手動 (本番はリリース前に実行)
- `wrangler.toml` で Pages Functions と D1 binding を定義

### バックアップ

- 週1で D1 を JSON ダンプして R2 (もしくは admin の Drive) に保存
- Pages Functions Cron Trigger で実装

---

## 8. テスト方針

- **Worker のロジック (csv parser, balance computation, aggregate)**: 純粋関数として Vitest unit
- **Worker の API**: Vitest + Miniflare で D1 をローカル実行してエンドポイント単位
- **移行スクリプト**: dry-run と本番の両方を必ずテスト (最重要)
- **フロント**: 既存通り。重要な箇所のみスモークテストを必要に応じて追加

---

## 9. 既存データからの移行

admin 専用エンドポイントで Drive の旧 JSON ファイルを D1 に取り込む:

- `POST /api/admin/migrate/budget` (PR #24): `budget.json` を読んで `members` / `category_order` / `annual_budgets` / `account_anchors` を D1 に書き込み
- `POST /api/admin/migrate/overrides` (PR-F): `overrides.json` の `byTxId` を読んで、D1 `transactions` から `mf_row_id` で逆引きして `(source_file_id, mf_row_id)` を解決し、`overrides` テーブルに書き込み
- 取引データ・資産データは「同期」ボタンで CSV から再取得 (移行不要)

各エンドポイントの安全策:

- `dryRun: true` でプレビュー
- D1 に既存データがあれば 409 を返す (`force: true` で上書き)
- `schemaVersion` チェック (budget) / `version: 1` チェック (overrides)
- `account_patterns_json` の型検証

`overrides` 移行で同じ `mf_row_id` が複数 `source_file_id` (重複期間の CSV) に存在する場合は、`csv_files.parsedAt` が最新のものを採用し summary に `ambiguous` カウントとして報告する。

旧 budget.json / overrides.json は Drive 上に残るが、新システムは触らない。不要になったら手動削除。

---

## 10. 過去の経緯

参考:

- 初期は「サーバ無しで Drive 直接アクセス」だった (`docs/HANDOFF.md` の旧版に詳細)
- `drive.file` 制約で書き込み 403 → 同名ファイル増殖の問題が発生
- iOS Safari のクッキー制限でモバイルが毎回再認証
- 「家族共有Webアプリ」として根本的に向いていないと判断 → 本アーキテクチャに刷新
