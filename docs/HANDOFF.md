# 引き継ぎドキュメント

## 1. プロジェクト概要

夫婦2人で使うプライベート家計簿。**マネーフォワードME 由来のCSVを Google Drive 経由で読み込み、ブラウザだけで集計表示**する静的SPA。サーバ・DBを持たない設計が肝。

### 採用しなかった選択肢

| 案                                        | 不採用理由                                                 |
| ----------------------------------------- | ---------------------------------------------------------- |
| Cloudflare D1 / Supabase などのクラウドDB | 家計データを別サービスに複製したくない                     |
| Electron / Docker のローカルアプリ        | 夫(Mac) + 妻(Windows) の2環境セットアップ + 同期機構が重い |
| 自宅サーバー（NAS）                       | 設置・運用負荷が高い、外出先からアクセスしにくい           |

採用案（静的SPA + Drive 直接アクセス）は、**Drive 1箇所にデータが集中** + **インフラ運用ゼロ** を両立できるのが決め手。

---

## 2. 主要な設計判断

### 2.1 認可スコープ：drive.readonly + drive.file の併用

当初は `drive.file` 単体で始めたが、**フォルダを Picker で選んでも配下ファイルを `files.list` で列挙できない** Google API の仕様で詰まった（`drive.file` は明示的に Picker 選択 / アプリ作成したファイルしか見えない）。

採用: `openid email profile drive.readonly drive.file`

- `drive.readonly`: 既存CSVの列挙・読み取り
- `drive.file`: アプリが作成する `budget.json` / `overrides.json` の書き込み（drive.readonly では書けない）

### 2.2 トークン管理：メモリのみ

- アクセストークンは Zustand の memory store のみ。`localStorage` / `sessionStorage` に置かない（XSS耐性）
- `localStorage` には次の2つだけ:
  - `household.auth.has-been-authed`: 「過去にログイン成功あり」フラグ。立ってる時のみ silent re-auth を試行（無駄なポップアップ防止）
  - `household.auth.last-email`: 最後にログインしたメールアドレス。silent re-auth の `loginHint` に使い、複数 Google アカウントが Chrome に登録されていてもアカウントチューザが出ないようにする。トークンではないので XSS で漏れても被害は実質無し
- silent re-auth は `prompt: 'none'` で実行（UI を一切出さない）。空文字列 `''` だと Google が必要に応じてアカウントチューザを出してしまうので使わない
- リロード時はメモリクリア → silent re-auth が走る → Google のセッションが生きてれば自動復帰
- リロード時に一瞬ポップアップウィンドウが開閉するのは GIS `initTokenClient` の仕様（OAuth ハンドシェイクのため popup 自体は必ず開く）。`prompt: 'none'` で UI 描画はスキップしているので、視覚的には一瞬光るだけ。これを完全に消すには iframe ベースの自前 OAuth 実装か Authorization Code + PKCE + バックエンドが必要で、家族2名運用ではコストに見合わないので受容している

### 2.3 Drive 同期戦略

| ファイル         | Drive 上     | ローカル                 | 同期方向         | タイミング                                                 |
| ---------------- | ------------ | ------------------------ | ---------------- | ---------------------------------------------------------- |
| `*.csv`          | MFが書く     | IndexedDB `transactions` | Drive → ローカル | 起動時 + 手動「同期」ボタン。`modifiedTime` 比較で増分のみ |
| `budget.json`    | アプリが作る | Zustand `budget.config`  | 双方向           | 起動時に Drive→Z, 編集時に Z→Drive (即時)                  |
| `overrides.json` | アプリが作る | IndexedDB `overrides`    | 双方向           | 起動時に Drive→IDB, 編集時に IDB→Drive (1.5秒デバウンス)   |

**競合解決は最後勝ち**。家族2人なので、楽観ロックや merge ロジックは入れていない。短時間に同時編集すると片方が消える可能性はあるが、運用上はほぼ起こらない想定。

### 2.4 IndexedDB のスキーマ（Dexie v2）

```
files       : driveFileId(主), modifiedTime, name, parsedAt, rowCount
transactions: id(主), date, yearMonth, sourceFileId, largeCategory, midCategory, account, ...
overrides   : id(主), updatedAt, largeCategory?, midCategory?, memo?, isTransferOverride?, excluded?
meta        : key(主), value
```

- `transactions.id` は MF CSV の `ID` 列（一意）
- `overrides.id` は対応する `transactions.id` と紐づく
- `meta` には `lastSyncedAt`, `budget.fileId`, `overrides.fileId`, `household.drive.folder` など

### 2.5 集計ロジック

すべて `src/lib/aggregate.ts` に集約。

- 集計から除外されるレコード: `isTransfer === true` または `isTarget === false`
- `applyOverridesToRows()` で IndexedDB の override を transactions に merge してから集計
- カテゴリ並び順は `budget.json.categoryOrder` で固定。未掲載のカテゴリは末尾に名前順

### 2.6 メンバー判定

- `budget.json.members[].accountPatterns: string[]` を口座名と部分一致で照合
- ヒットしなければ "未割当"
- 設定画面に「未割当の口座」一覧を出して、クリックで該当メンバーの patterns に追加できる

### 2.7 Zustand selector の罠

**重要**: selector で `?? []` などの空配列リテラルを返すと、毎レンダー新しい参照になり `useSyncExternalStore` の比較で常に「変化した」と判定 → 無限ループ。

```ts
// NG：無限ループ
const items = useStore((s) => s.config?.members ?? []);

// OK：参照を安定させ、コンポーネント側でガード
const items = useStore((s) => s.config?.members);
if (!items || items.length === 0) return null;
```

新しいコンポーネントを書くときは要注意。

---

## 3. 画面別の機能と未実装事項

| 画面             | 状態                                                                              | 残タスク                                               |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `/dashboard`     | ✅ 実装済み                                                                       | （なし）                                               |
| `/transactions`  | ✅ 実装済み（仮想スクロール、検索、フィルタ、上書きモーダル）                     | （なし）                                               |
| `/categories`    | ✅ 実装済み（ドーナツ、推移テーブル、店舗別/曜日別/12ヶ月推移）                   | 「年次」「比較」タブはモック上にあるが未実装           |
| `/budget`        | ✅ 実装済み（カテゴリ別予算、進捗、超過アラート、月単位上書き）                   | （なし）                                               |
| `/settings`      | ✅ 実装済み（フォルダ、メンバー、カテゴリ並び順、データ診断、キャッシュリセット） | （なし）                                               |
| `/report`        | ⏳ placeholder のみ                                                               | 後段。`/categories` の「年次」「比較」と統合する案あり |
| オンボーディング | △ AuthGate と Dashboard の FolderEmpty で代替                                     | 専用画面は未実装。今のフローで十分動く                 |
| 未認可ユーザ     | ✅ AuthGate の `unauthorized` 状態でメッセージ表示                                | （なし）                                               |

---

## 4. 残タスク（Step 13）

### 必須

- [ ] **Cloudflare Pages デプロイ**
  - GitHub プライベートリポ作成 → push
  - Cloudflare Dashboard → Pages → GitHub 連携
  - Build command: `npm run build` / Build output: `dist`
  - 環境変数: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_ALLOWED_EMAILS`
  - 発行された `*.pages.dev` を Google Cloud Console の「承認済み JavaScript 生成元」「APIキーのHTTPリファラー」に追加
- [ ] **本番 URL での実機動作確認**（夫の Mac、妻の Windows）

### 推奨

- [ ] **コード分割**（現状メインバンドル ~900KB）
  - Recharts と Categories.tsx を `React.lazy` で分離
  - dnd-kit を Settings 内だけで読み込む
  - 目標: 初回バンドル 500KB 以下
- [ ] **エラーバウンダリ**: 例外時に白画面ではなくフォールバック表示
- [ ] **レスポンシブ調整**: 現状 max-md 用の最小対応のみ。スマホ表示で取引一覧の列幅・カテゴリ画面の3列レイアウトを縦並びに
- [ ] **Lighthouse 計測**: A 評価を目指す（CSP・headers は既に設定済み、PWA 化は任意）

### 任意

- [ ] **メンバー別支出のダッシュボード表示**（variant-a の世帯メンバー枠の本実装）
- [ ] **`/report` の年次・比較タブ実装**
- [ ] **PWA 化**（オフライン参照、ホーム画面追加）
- [ ] **エクスポート機能**（集計結果をCSV/PDFで出力）
- [ ] **同期競合の検知**（modifiedTime ベースの楽観ロック）

---

## 5. デプロイ手順（Cloudflare Pages）

### 前提

- Cloudflare アカウント（無料プランで OK）
- GitHub アカウント

### 手順

1. **GitHub プライベートリポ作成 + push**

   ```bash
   gh repo create household-budget --private --source=. --push
   # or
   git remote add origin git@github.com:<user>/household-budget.git
   git push -u origin main
   ```

2. **Cloudflare Pages プロジェクト作成**
   - Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
   - リポジトリ選択 → 設定:
     - Production branch: `main`
     - Framework preset: `Vite`
     - Build command: `npm run build`
     - Build output directory: `dist`
     - Root directory: `/`

3. **環境変数の設定**
   Cloudflare Pages の「Settings → Environment variables」で Production に登録:
   - `VITE_GOOGLE_CLIENT_ID` = `.env.local` と同じ値
   - `VITE_GOOGLE_API_KEY` = `.env.local` と同じ値
   - `VITE_ALLOWED_EMAILS` = `nok.24.eva.05@gmail.com,mieko.kawamura.mail@gmail.com`

4. **初回デプロイ後、URL を Google 側に登録**
   - 発行された `https://<project>.pages.dev` を控える
   - Google Cloud Console → APIs & Services → 認証情報:
     - **OAuthクライアントID** の「承認済み JavaScript 生成元」に `https://<project>.pages.dev` を追加
     - **API キー** の「HTTPリファラー」に `https://<project>.pages.dev/*` を追加
   - Drive の家計簿フォルダの共有を再確認（家族2名のみが「閲覧者」または「編集者」）

5. **動作確認**
   - 本番 URL で家族2名のアカウントでそれぞれログイン
   - フォルダ Picker で同じフォルダを選択
   - 同期 → ダッシュボード表示
   - 取引上書き → 別端末でリロードして反映確認
   - DevTools の Network で `oauth2.googleapis.com` / `googleapis.com/drive` 以外への通信が無いことを確認

### よくあるハマりどころ

- **「This app is blocked」**: Testing モードの未登録アカウントでログインしようとしている → Cloud Console でテストユーザに追加
- **「Failed to open popup」**: ブラウザのポップアップブロッカー → サイト個別に許可
- **CSP エラー（Cloudflare ログで確認）**: `_headers` の CSP に新しいオリジンを追加が必要
- **Picker で「The API developer key is invalid」**: `_headers` の `Referrer-Policy` が `no-referrer` だと Referer ヘッダが送られず、Google APIキーの「ウェブサイトの制限（HTTP リファラー）」が常にブロックする。`strict-origin-when-cross-origin` にしてオリジンだけ送るのが正解。`no-referrer` は API キーのリファラー制限を実質無効化するので組み合わせて使えない

---

## 6. 環境変数

`.env.local`（git 管理外）に以下を設定:

```
VITE_GOOGLE_CLIENT_ID=972177858790-3q7etbmd4829v4mrpvh9s4jbbf11d2pb.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIzaSy...
VITE_ALLOWED_EMAILS=nok.24.eva.05@gmail.com,mieko.kawamura.mail@gmail.com
```

`.env.example` に空のテンプレが入っている。clone 直後は `cp .env.example .env.local` してから埋める。

---

## 7. データ参照先

| 種別                                 | 場所                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| マネーフォワードCSV                  | Google Drive の家計簿フォルダ（手動エクスポート + アップロード） |
| 予算 / カテゴリ並び順 / メンバー設定 | 同フォルダ内 `budget.json`（アプリが作成・更新）                 |
| 取引の手動上書き                     | 同フォルダ内 `overrides.json`（アプリが作成・更新）              |
| ローカルキャッシュ                   | ブラウザ IndexedDB `household-budget`                            |
| OAuth クライアントID / API キー      | Google Cloud Console プロジェクト `household-budget`             |

---

## 8. 開発時のワークフロー

```bash
# 開発サーバ起動（変更は HMR で即反映）
npm run dev

# 型エラーチェック
npm run typecheck

# Lint
npm run lint

# ビルド確認
npm run build

# Cloudflare Pages相当のプレビュー
npm run preview
```

CSP は本番（Cloudflare Pages）でしか効かない。dev では緩いので、デプロイ前に `npm run preview` で実本番に近い環境を確認するのが安全。

---

## 9. 既知の制約

- **Drive 競合**: 家族2人が同じファイルを同時編集すると最後勝ち。実害ほぼなし
- **Testing モードのトークン7日失効**: 7日ごとに再ログインが必要（Production 申請しなければこの仕様）
- **drive.file の制約**: 既に手動で置かれた `budget.json` は読めるが書けない（403 `appNotAuthorizedToFile`）。アプリが新規作成したものだけ書き込み可能。書き込み失敗時は同名の新規ファイルを作成してフォールバックするので運用は継続できるが、**Drive上に同名ファイルが2つ並ぶ**。中身を確認して古い方を手動で削除すること（drive.file ではアプリから削除できない）
- **MF CSV のスキーマ変更**: MF が将来CSV列を変えると `budget.json.schemaVersion` で検知できる仕組みは未実装
- **メインバンドル ~900KB**: code-split 未対応。Step 13 の磨き込みで対応予定

---

## 10. 設計時の参照ドキュメント

- 計画書: `~/.claude/plans/web-macbook-wiondows-csv-drive-cached-hamster.md`
- デザインモック: `design_handoff_kakeibo/`（変更しない、参照のみ）
- メモリ: `~/.claude/projects/-Users-naoki-kawamura-Projects-household-budget/memory/`
