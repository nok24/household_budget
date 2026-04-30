# 家計簿 Webダッシュボード

夫婦2人で使うプライベートな家計ダッシュボード。マネーフォワードME のCSVを Google Drive から直接読み込み、ブラウザ内だけで集計表示する。サーバ・DB は持たない。

## 主な特徴

- **データ保管はGoogle Drive 1箇所**: CSV / `budget.json` / `overrides.json` を同フォルダに集約。アプリは静的SPAで、外部DBに家計データを複製しない
- **2層の認可境界**: OAuth 同意画面の Testing ユーザ（家族2名のみ）+ Drive フォルダの共有設定（特定の人）。クライアント側ホワイトリストはUX用
- **増分同期**: Drive 上のCSVを `modifiedTime` 比較で差分のみダウンロード、IndexedDBにキャッシュ
- **ローカル編集の Drive 同期**: 取引の上書き（カテゴリ・振替・除外）は IndexedDB → 1.5秒デバウンスで `overrides.json` に書き戻し、家族間で共有
- **予算と並び順は budget.json で共有**: カテゴリ並び順は D&D で編集
- **メンバー判定**: 口座名 → 夫/妻/共通 を accountPatterns でルール化、未割当口座はクリックで割当

## 主要画面

| ルート | 役割 |
|---|---|
| `/dashboard` | KPI（収入/支出/収支/貯蓄率）+ 月次推移 + カテゴリドーナツ + 予算消化 + 直近取引 |
| `/transactions` | 全期間の仮想スクロール取引一覧。検索・カテゴリ・メンバー・振替フィルタ・上書きモーダル |
| `/categories` | 大ドーナツ + カテゴリ別 推移と予算 + 詳細（店舗別/曜日別/12ヶ月推移） |
| `/budget` | カテゴリ毎の月次予算編集（既定値 + 当月上書き）、進捗バー、超過アラート |
| `/report` | 後段で実装予定 |
| `/settings` | フォルダ再選択、メンバー、カテゴリ並び順、データ診断、キャッシュリセット |

## 技術スタック

| 領域 | 採用 |
|---|---|
| ビルド | Vite 6 + TypeScript 5 |
| UI | React 18 + Tailwind CSS 3 |
| ルーティング | React Router 7 |
| グローバル状態 | Zustand 5 |
| 非同期キャッシュ | TanStack Query 5 |
| ローカルキャッシュ | Dexie 4 (IndexedDB) + dexie-react-hooks |
| グラフ | Recharts 2 + 自前 Sparkline (SVG) |
| CSV | Papa Parse 5 + encoding-japanese (Shift_JIS) + Web Worker (Comlink) |
| 仮想スクロール | TanStack Virtual 3 |
| D&D | dnd-kit |
| 日付 | dayjs |
| 認証 | Google Identity Services (TokenClient) |
| Drive アクセス | Drive API v3 + Picker API（`drive.readonly` + `drive.file`） |
| ホスティング | Cloudflare Pages（予定） |

## ローカル起動

```bash
npm install
cp .env.example .env.local
# .env.local の Client ID / API Key / 許可メールアドレスを埋める
npm run dev
```

http://localhost:5173/ を開く。

## ドキュメント

- 設計判断・データフロー・引き継ぎ事項: [`docs/HANDOFF.md`](./docs/HANDOFF.md)
- デザイントークン・コンポーネント: [`docs/DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md)
- 計画書（最初の方針合意）: [`~/.claude/plans/web-macbook-wiondows-csv-drive-cached-hamster.md`](../../.claude/plans/web-macbook-wiondows-csv-drive-cached-hamster.md)

## スクリプト

| コマンド | 用途 |
|---|---|
| `npm run dev` | Vite dev サーバー起動 (port 5173) |
| `npm run build` | 本番ビルド（型チェック込み）|
| `npm run preview` | ビルド成果物のプレビュー |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 型チェックのみ |
| `npm run format` | Prettier 整形 |

## ディレクトリ

```
.
├─ design_handoff_kakeibo/   ← UI参照用の元デザイン（参照のみ、編集しない）
├─ docs/                     ← ドキュメント
├─ public/
│   ├─ _headers              ← Cloudflare Pages のセキュリティヘッダ
│   ├─ _redirects            ← SPA フォールバック
│   └─ robots.txt            ← クローラー全拒否
├─ src/
│   ├─ components/           ← 共通UIコンポーネント
│   │   ├─ charts/           ← Recharts ラッパ + Sparkline
│   │   ├─ AuthGate.tsx
│   │   ├─ CategoryOrderEditor.tsx
│   │   ├─ DiagnosticsPanel.tsx
│   │   ├─ EditTransactionModal.tsx
│   │   ├─ FolderPickerButton.tsx
│   │   ├─ Layout.tsx
│   │   ├─ MemberEditor.tsx
│   │   ├─ MonthSwitcher.tsx
│   │   └─ ProgressBar.tsx
│   ├─ routes/               ← 各画面
│   │   ├─ Budget.tsx
│   │   ├─ Categories.tsx
│   │   ├─ Dashboard.tsx
│   │   ├─ Report.tsx
│   │   ├─ Settings.tsx
│   │   └─ Transactions.tsx
│   ├─ lib/                  ← ドメインロジック
│   │   ├─ aggregate.ts      ← 月次/カテゴリ集計
│   │   ├─ auth.ts           ← GIS ラッパ
│   │   ├─ budget.ts         ← budget.json R/W
│   │   ├─ categories.ts     ← カテゴリ色マッピング
│   │   ├─ configFile.ts     ← Drive 上 JSON 汎用R/W
│   │   ├─ csv.ts            ← Shift_JIS デコード + Papa Parse
│   │   ├─ db.ts             ← Dexie スキーマ
│   │   ├─ diagnostics.ts    ← データ診断（月別内訳）
│   │   ├─ drive.ts          ← Drive API fetch
│   │   ├─ members.ts        ← メンバー判定
│   │   ├─ overrides.ts      ← 取引上書き R/W
│   │   ├─ overridesSync.ts  ← overrides.json Drive 同期
│   │   ├─ picker.ts         ← Google Picker
│   │   ├─ sync.ts           ← CSV 増分同期
│   │   └─ utils.ts          ← formatYen, cn など
│   ├─ store/                ← Zustand
│   │   ├─ auth.ts
│   │   ├─ budget.ts
│   │   ├─ folder.ts
│   │   ├─ overrides.ts
│   │   ├─ sync.ts
│   │   └─ ui.ts
│   ├─ types/
│   │   ├─ gis.d.ts          ← Google Identity Services 型
│   │   ├─ google-api.d.ts   ← gapi/Picker 型
│   │   └─ index.ts          ← BudgetConfig 等のドメイン型
│   ├─ workers/
│   │   └─ csvWorker.ts      ← CSVパースを別スレッドで
│   ├─ App.tsx
│   ├─ main.tsx
│   └─ index.css
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.ts
└─ tsconfig*.json
```

## セキュリティ前提

3層で防御。**(1)+(2) が本丸、(3) は表示用**。

1. **OAuth 同意画面 (Testing モード)** — Google Cloud Console のテストユーザに登録した家族2名のみログイン可
2. **Drive フォルダ共有設定** — 「特定の人」共有で家族2名のみ
3. **クライアント側ホワイトリスト** — `.env.local` の `VITE_ALLOWED_EMAILS` で UX 表示用

`*.csv` / `budget.json` / `overrides.json` は `.gitignore` で除外済み（事故防止）。

## デプロイ（予定: Cloudflare Pages）

詳細は [`docs/HANDOFF.md`](./docs/HANDOFF.md) のデプロイ手順を参照。
