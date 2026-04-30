# 開発ルール

開発者は1人。利用者は夫婦2人。レビュー相手は将来の自分。**「Diff を読み返したときに意図が追える」「壊れた瞬間に気づける」** の2点を担保する最小限の規約。

---

## 1. ブランチ運用（GitHub Flow）

```
main ────●────●────●────●────●  (常にデプロイ可能)
          \   ↑    ↑    ↑    ↑
           feat/x  fix/y  ...   PR でマージ
```

- **`main` は常にデプロイ可能** にする。直接 push しない。
- 変更は **feature branch** で行い、PR でマージする（自分1人でもセルフレビュー＋セルフマージ）。
- ブランチ名: `<type>/<短い説明>`
  - 例: `feat/category-detail-yearly`, `fix/sync-popup-blocked`, `chore/dependabot-config`
  - `<type>` は下記コミットメッセージの type と同じ語彙を使う。
- マージ戦略: **Squash merge**（PR内の作業履歴を `main` に持ち込まない）。コミットの粒度は PR 単位。
- マージ後はブランチ削除（GitHub の自動削除設定 ON 推奨）。

### Branch protection（GitHub 側で設定）

`main` ブランチに以下を設定:

- Require a pull request before merging（self approval を許可）
- Require status checks to pass before merging → CI の `Typecheck / Lint / Build` を必須に
- Require linear history
- Do not allow bypassing the above settings

設定場所: Settings → Branches → Add rule → Branch name pattern `main`。

---

## 2. コミットメッセージ（Conventional Commits）

`commitlint` で **commit-msg hook** にて検証。違反するとコミット不可。

### 形式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### type

| type       | 用途                                                     |
| ---------- | -------------------------------------------------------- |
| `feat`     | 新機能                                                   |
| `fix`      | 不具合修正                                               |
| `refactor` | 振る舞いを変えない内部改善                               |
| `style`    | フォーマット・空白・セミコロンなど（コードに影響しない） |
| `docs`     | ドキュメント                                             |
| `test`     | テスト追加・修正                                         |
| `build`    | ビルド設定・依存関係                                     |
| `ci`       | CI設定                                                   |
| `chore`    | その他、上記に当てはまらない雑務                         |
| `perf`     | パフォーマンス改善                                       |
| `revert`   | コミットの差し戻し                                       |

### scope（任意）

画面・モジュール名で簡潔に。例: `dashboard`, `transactions`, `budget`, `auth`, `drive`, `db`, `deps`。

### subject

- 命令形・現在形（"add"、"fix"、日本語の体言止めも可）。
- 末尾にピリオド・句点を打たない。
- 100文字以内（commitlint で `header-max-length: 100` に拡張済み。日本語が入りやすいため）。

### 例

```
feat(budget): カテゴリ並び順を D&D で編集可能にする
fix(layout): MembersSummary の selector 無限ループを解消
docs: HANDOFF にデプロイ手順を追加
build(deps): bump @dnd-kit/core to 6.4
ci: dependabot を週1の monday に変更
```

### Breaking change

コミットフッターに `BREAKING CHANGE: ...` を入れる。`budget.json` のスキーマ変更や OAuth スコープ変更時は必須。

---

## 3. コードスタイル

すべて自動化済み。**手で整えない**。

### フォーマット

- **Prettier**（設定: `.prettierrc`）
  - シングルクォート、セミコロンあり、trailing comma all、printWidth 100、tabWidth 2、LF
- pre-commit hook（lint-staged）で自動整形 → 手で気にする必要なし。

### Lint

- **ESLint v9 flat config**（`eslint.config.js`）
  - `@typescript-eslint/recommended`
  - `react-hooks/recommended`
  - `react-refresh/only-export-components`
  - 未使用変数: `_` プリフィックスのみ許容
- pre-commit で `eslint --fix` が走る。残った警告は手で対応。

### TypeScript

- **strict 系すべて有効**（`tsconfig.app.json`）
  - `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`
- `any` は基本禁止。やむを得ない場合は理由をコメント。
- pre-commit で `tsc -b --noEmit` が走る → 型エラーがあるとコミット不可。

### React / Zustand 注意点

- **Zustand selector で空配列・空オブジェクトリテラルを返さない**（`?? []` 禁止）。`useSyncExternalStore` の比較で無限ループになる。fallback はコンポーネント側でガードする。詳細: `~/.claude/projects/.../memory/feedback_zustand_selectors.md`
- 複数値を一度に取りたいときは個別 selector または `useShallow`。
- `useEffect` の deps は ESLint の警告を尊重。`// eslint-disable-next-line` を使うときは1行で理由を書く。

---

## 4. 動作確認

### ローカル開発

```bash
nvm use            # .nvmrc → Node 20
npm install
cp .env.example .env.local  # 初回のみ。中身は HANDOFF 参照
npm run dev
```

### コミット前に走るもの（自動）

| Hook       | コマンド                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| pre-commit | `lint-staged`（変更ファイルだけ eslint+prettier）→ `npm run typecheck`（プロジェクト全体） |
| commit-msg | `commitlint`（Conventional Commits 違反でコミット不可）                                    |

### CI（GitHub Actions）

`pull_request` と `push to main` で実行:

- `typecheck`
- `lint`
- `build`

CI が通らない PR はマージできない（branch protection で必須化）。

### 実機確認

UI 変更を含む PR は、PR 本文に **スクリーンショット** か少なくとも「ローカルで実機確認した旨」を書く（PR テンプレに従う）。

---

## 5. 依存関係

- **Dependabot** が毎週月曜に PR を作る（npm + GitHub Actions）。
- Dev依存・型定義・eslint 系・TanStack 系・dnd-kit 系・tailwind 系はグループ化（`.github/dependabot.yml`）。
- `npm install` は **lockfile を伴うコミット** にすること。lockfile の手動編集禁止。
- 大きな major bump（React, Vite, Tailwind 等）は PR 本文に互換性メモを残す。

---

## 6. PR ワークフロー

1. ブランチを切る（`git switch -c feat/xxx`）
2. 変更 → コミット（hook が走る）
3. `git push -u origin feat/xxx`
4. GitHub で PR 作成 → テンプレートに沿って記入
5. CI を待つ
6. 自分でレビュー（diff を読み直す）
7. **Squash and merge**
8. ブランチ削除

レビュー観点（セルフチェックリスト）:

- 関連ファイルすべてに目を通したか
- 設計判断（なぜこう書いたか）が diff から読み取れるか。読み取れないなら本文に書く
- スキーマ・権限・環境変数に影響していないか
- 他画面に副作用がないか（特に Layout / store 周り）

---

## 7. リリース・デプロイ

- `main` への マージで Cloudflare Pages が自動デプロイ。
- Cloudflare Pages の Production 環境変数は GitHub に**コミットしない**（Cloudflare Dashboard で管理）。
- スキーマ変更を含むデプロイは、**Drive 上の `budget.json` / `overrides.json` の互換性**を必ず確認。後方互換が無いなら `BREAKING CHANGE` フッター付きで PR を分け、運用上の手当て（手動マイグレーション or 自動アップグレード処理）を含める。

---

## 8. テスト戦略（現時点で未整備）

- 自動テストは未導入。
- 必要になったタイミングで **Vitest + React Testing Library** を入れる方針（Vite なら `vitest` が一番素直）。
- 最初に書くべきは `src/lib/aggregate.ts` の集計ロジックと `src/lib/csv.ts` の Shift_JIS パース。

---

## 9. ドキュメント運用

- README.md: 概要・クイックスタート（変更頻度: 低）
- docs/HANDOFF.md: 設計判断・残タスク・運用情報（変更頻度: 中）
- docs/DESIGN_SYSTEM.md: トークン・パターン（デザイン変更時のみ）
- docs/DEVELOPMENT.md: このファイル。ルール変更時のみ
- メモリ（`~/.claude/projects/.../memory/`): 個別の作業時に参照する事実・落とし穴

ドキュメントの更新も Conventional Commits の `docs:` で扱う。
