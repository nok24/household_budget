# デザインシステム

`design_handoff_kakeibo/variants/variant-a.jsx`（クラシック・コンパクト）を基準にしたデザイントークンとパターン集。実装は Tailwind config + 共通コンポーネントに反映済み。

---

## 1. カラー

| 用途 | トークン (Tailwind) | 値 | 備考 |
|---|---|---|---|
| アクセント（深緑） | `accent` / `bg-accent` / `text-accent` | `#3F5A4A` | プライマリボタン、収入色、ハイライト |
| 暖かい補助色 | `accent-warm` | `#B8A78A` | メンバー（妻）の既定色 |
| 冷たい補助色 | `accent-cool` | `#9AA5B1` | カテゴリ（光熱）など |
| キャンバス背景 | `bg-canvas` | `#F7F5F1` | ページ全体背景 |
| サーフェス | `bg-surface` | `#FFFFFF` | カード背景 |
| サイドバー背景 | `bg-sidebar` | `#FBF9F5` | ナビ |
| 罫線 | `border-line` | `rgba(26,26,26,0.08)` | カード境界、テーブル行 |
| インク | `text-ink` | `#1A1A1A` | 本文 |
| インク 70% | `text-ink-70` | `rgba(26,26,26,0.7)` | サブテキスト |
| インク 60% | `text-ink-60` | `rgba(26,26,26,0.6)` | キャプション |
| インク 40% | `text-ink-40` | `rgba(26,26,26,0.4)` | プレースホルダ・eyebrow |
| 警告（超過） | `text-rose-700` / `bg-rose-600` | Tailwind 既定 | 予算超過、エラー |
| 注意（90%超） | `text-amber-700` | Tailwind 既定 | カテゴリ予算 90% 超 |

### カテゴリ色（`src/lib/categories.ts`）

MF 大項目名 → 固定色のマッピング。未登録カテゴリはハッシュベースのフォールバック。

| カテゴリ | 色 |
|---|---|
| 食費 | `#7B8F6E` |
| 住居 | `#A89884` |
| 水道・光熱 | `#9AA5B1` |
| 交通 / 交通費 | `#B8A78A` |
| 通信 / 通信費 | `#8E9AAB` |
| 医療・健康 | `#C9A89A` |
| 娯楽 / 趣味・娯楽 | `#B5916A` |
| 教育・教養 | `#9C8FA8` |
| 衣服・美容 | `#C9967A` |
| 収入 | `#3F5A4A`（accent） |
| 未分類 / その他 | `#A89C90` |

---

## 2. タイポグラフィ

```css
font-family: "Noto Sans JP", -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
font-feature-settings: "palt" 1;  /* 詰め組み */
```

数値表示（金額・件数・パーセント）は `tabular-nums` クラスで等幅にする。

| 用途 | サイズ | 太さ | 字間 |
|---|---|---|---|
| ページ大見出し (h1) | 22px | 500 | -0.01em |
| KPI 数値 | 26px | 500 | -0.01em |
| カードヘッダ (eyebrow) | 11px | 500 | 0.08em |
| ページ eyebrow（DASHBOARD等）| 11px | 400 | 0.1em |
| 通常本文 | 13–14px | 400 | 通常 |
| キャプション | 11px | 400 | 通常 |
| 微小ラベル | 10px | 500 | 0.06–0.1em |

---

## 3. レイアウト

### グローバル

- メインシェル: `grid grid-cols-[200px_1fr]`
  - サイドバー 200px 固定 / メイン 残り
  - `max-md` でサイドバーを横スクロール nav に切り替え

### カード

```html
<div class="card p-5">
  <div class="text-[11px] tracking-[0.08em] text-ink-60 mb-4 font-medium">
    LABEL
  </div>
  <!-- 本体 -->
</div>
```

`.card` クラス（src/index.css）:
```css
@apply bg-surface border border-line rounded-card shadow-card;
/* rounded-card = 8px, shadow-card = 0 1px 2px rgba(0,0,0,0.04) */
```

### KPI カード

| 要素 | クラス |
|---|---|
| eyebrow | `text-[10px] tracking-[0.08em] text-ink-60 mb-3 font-medium` |
| 数値 | `text-[26px] font-medium tabular-nums leading-tight tracking-[-0.01em] mb-1` |
| サブテキスト | `text-[11px] text-ink-40` |
| 進捗バー | mt-3, ProgressBar 共通コンポーネント |

---

## 4. 共通コンポーネント

| コンポーネント | パス | 用途 |
|---|---|---|
| `Layout` | `components/Layout.tsx` | サイドナビ + メイン領域 + アバター/メンバー/同期ステータス |
| `MonthSwitcher` | `components/MonthSwitcher.tsx` | 「← 前月」「今月」「翌月 →」ボタン |
| `ProgressBar` | `components/ProgressBar.tsx` | 進捗バー（accent / 超過時 rose）|
| `FolderPickerButton` | `components/FolderPickerButton.tsx` | Drive Picker 起動 |
| `EditTransactionModal` | `components/EditTransactionModal.tsx` | 取引上書きモーダル |
| `MemberEditor` | `components/MemberEditor.tsx` | メンバー設定 |
| `CategoryOrderEditor` | `components/CategoryOrderEditor.tsx` | カテゴリ並び順 D&D |
| `DiagnosticsPanel` | `components/DiagnosticsPanel.tsx` | データ診断（月別内訳） |
| `AuthGate` | `components/AuthGate.tsx` | 認証ゲート + ログイン画面 |

### グラフ

| コンポーネント | ベース | 備考 |
|---|---|---|
| `TrendBarChart` | Recharts BarChart | 月次収支推移、選択月をハイライト |
| `CategoryDonut` | Recharts PieChart | カテゴリ別ドーナツ、中央にラベル |
| `Sparkline` | 自前 SVG | カテゴリ12ヶ月推移用、軽量 |

---

## 5. ボタンスタイル

### プライマリ
```html
<button class="px-3.5 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
  保存
</button>
```

### セカンダリ（白）
```html
<button class="px-3 py-1.5 text-xs border border-line rounded-md text-ink-60 hover:bg-canvas hover:text-ink transition-colors">
  キャンセル
</button>
```

### トグル（セグメンテッド）
連結ボタン群。選択中は `bg-accent text-white`、非選択は `text-ink-60 hover:bg-canvas`。境界線は `border border-line`、隣接で `-ml-px`。

例: 取引一覧の「すべて / 支出 / 収入」、レポートの「月次 / 年次 / 比較」。

### バッジ・チップ

```html
<span
  class="text-[10px] px-1.5 py-0.5 rounded-sm"
  style="color: <カテゴリ色>; background: <色>15"
>
  食費
</span>
```

カテゴリ色は `colorForCategory(name)` で取得。背景は `${color}15` (16進アルファ ~8%) で淡く。

---

## 6. テーブル

### ヘッダ
```html
<div class="grid grid-cols-[...] gap-3 text-[10px] tracking-[0.08em] text-ink-40 px-[18px] py-3 border-b border-line bg-sidebar font-medium">
  <span>列名</span>
  ...
</div>
```

### 行
- 高さ 44px 程度（仮想スクロール時は固定）
- `border-b border-line/60` で区切り線
- ホバーで `bg-canvas`
- 数値は `tabular-nums` + `text-right`

---

## 7. アイコン・装飾

- ナビ項目の左に `w-3.5 h-px bg-ink-40`（薄い横線、active で `bg-accent`）
- ロゴ: `w-2 h-2 bg-accent rounded-sm`（小さい正方形）+ 「家計簿」テキスト
- 大項目バッジ: `w-1.5 h-1.5 rounded-sm` の色ドット + テキスト

---

## 8. アクセシビリティ・操作

- D&D（カテゴリ並び順）: マウス + キーボード（Tab → Space → 矢印 → Space）両対応（dnd-kit）
- ESC キーでモーダル・プルダウンを閉じる（EditTransactionModal、未割当口座の割当プルダウン）
- 仮想スクロール（取引一覧）はキーボードでスクロール可能
- カラーはコントラスト比 AA 以上を意識（深緑 #3F5A4A vs 白 = 8.9:1）

---

## 9. 設計時のリファレンス

`design_handoff_kakeibo/` 内の各ファイル:

- `variants/variant-a.jsx` — ダッシュボードのレイアウト基準
- `screens/transactions.jsx` — 取引一覧レイアウト
- `screens/report.jsx` — カテゴリ画面のレイアウト
- `components/charts.jsx` — Donut / TrendBars / Sparkline / HBar / CalHeat の元実装
- `data/mock.js` — モックデータ（実データへの移植時の型参照）

このフォルダは**変更しない**（参照専用）。実装側で参照するときは構造だけ真似て、データは IndexedDB 由来に差し替える。
