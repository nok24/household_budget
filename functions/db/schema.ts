import { sqliteTable, text, integer, blob, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// 家計簿アプリの D1 スキーマ。
// docs/ARCHITECTURE.md §3 を正本とし、変更時は両方更新すること。

// ─────────────────────────────────────────────────────────────
// 認証・ユーザ
// ─────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  /** Google ID Token の sub をそのまま使う */
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  createdAt: integer('created_at').notNull(), // unix ms
});

export const sessions = sqliteTable(
  'sessions',
  {
    /** 256bit ランダムを hex で 64文字 */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    userAgent: text('user_agent'),
  },
  (t) => ({
    expiresIdx: index('idx_sessions_expires').on(t.expiresAt),
  }),
);

// ─────────────────────────────────────────────────────────────
// アプリ設定 / シークレット
// ─────────────────────────────────────────────────────────────

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const encryptedSecrets = sqliteTable('encrypted_secrets', {
  /** 例: 'drive_refresh_token' */
  key: text('key').primaryKey(),
  ciphertext: blob('ciphertext').notNull(),
  iv: blob('iv').notNull(),
  /** AES 鍵のローテ用バージョン識別子 */
  keyId: text('key_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ─────────────────────────────────────────────────────────────
// 取引・上書き
// ─────────────────────────────────────────────────────────────

export const transactions = sqliteTable(
  'transactions',
  {
    /** surrogate id */
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** MF CSV の ID 列 */
    mfRowId: text('mf_row_id').notNull(),
    sourceFileId: text('source_file_id').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    yearMonth: text('year_month').notNull(), // YYYY-MM
    amount: integer('amount').notNull(), // 円
    contentName: text('content_name'),
    account: text('account'),
    largeCategory: text('large_category'),
    midCategory: text('mid_category'),
    memo: text('memo'),
    isTarget: integer('is_target').notNull(), // 0 / 1
    isTransfer: integer('is_transfer').notNull(),
  },
  (t) => ({
    sourceRowUnique: uniqueIndex('uq_tx_source_row').on(t.sourceFileId, t.mfRowId),
    yearMonthIdx: index('idx_tx_year_month').on(t.yearMonth),
    accountIdx: index('idx_tx_account').on(t.account),
  }),
);

export const overrides = sqliteTable('overrides', {
  /** 対応する transactions.id を主キーに兼ねる */
  transactionId: integer('transaction_id')
    .primaryKey()
    .references(() => transactions.id),
  largeCategory: text('large_category'),
  midCategory: text('mid_category'),
  memo: text('memo'),
  /** null の場合は元の振替フラグを尊重 */
  isTransferOverride: integer('is_transfer_override'),
  /** 1 の場合は集計から除外 (isTarget=0 相当) */
  excluded: integer('excluded'),
  /** 監査用: 誰が触ったか */
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: integer('updated_at').notNull(),
});

// ─────────────────────────────────────────────────────────────
// 家計設定 (members / カテゴリ並び順 / 年間予算 / 口座アンカー)
// ─────────────────────────────────────────────────────────────

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  /** JSON 配列。例: ["楽天カード", "みずほ銀行"] */
  accountPatternsJson: text('account_patterns_json').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const categoryOrder = sqliteTable('category_order', {
  /** 0始まりの並び順 */
  idx: integer('idx').primaryKey(),
  name: text('name').notNull(),
});

export const annualBudgets = sqliteTable('annual_budgets', {
  category: text('category').primaryKey(),
  amount: integer('amount').notNull(),
});

export const accountAnchors = sqliteTable('account_anchors', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  pattern: text('pattern').notNull(),
  asOfDate: text('as_of_date').notNull(), // YYYY-MM-DD
  balance: integer('balance').notNull(),
});

// ─────────────────────────────────────────────────────────────
// 資産推移 (CSV 由来)
// ─────────────────────────────────────────────────────────────

export const assetSnapshots = sqliteTable('asset_snapshots', {
  yearMonth: text('year_month').primaryKey(), // YYYY-MM
  date: text('date').notNull(), // YYYY-MM-DD (その月の最終日)
  total: integer('total').notNull(),
  savings: integer('savings').notNull(),
  stocks: integer('stocks').notNull(),
  funds: integer('funds').notNull(),
  pension: integer('pension').notNull(),
  points: integer('points').notNull(),
  sourceFileId: text('source_file_id').notNull(),
});

// ─────────────────────────────────────────────────────────────
// CSV ファイルメタ・同期ログ
// ─────────────────────────────────────────────────────────────

export const csvFiles = sqliteTable(
  'csv_files',
  {
    /** Drive 上の file id */
    driveFileId: text('drive_file_id').primaryKey(),
    /** 'transactions' | 'asset' */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    modifiedTime: text('modified_time').notNull(),
    parsedAt: integer('parsed_at').notNull(),
    rowCount: integer('row_count').notNull(),
  },
  (t) => ({
    kindIdx: index('idx_csv_kind').on(t.kind),
  }),
);

export const syncLog = sqliteTable(
  'sync_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 'transactions' | 'asset' */
    kind: text('kind').notNull(),
    /** 'running' | 'success' | 'error' */
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    fetched: integer('fetched'),
    /** JSON 配列の文字列。エラー詳細 */
    errorsJson: text('errors_json'),
  },
  (t) => ({
    kindStatusIdx: index('idx_sync_kind_status').on(t.kind, t.status),
  }),
);
