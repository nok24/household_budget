import type { Database } from './db';
import {
  accountAnchors,
  annualBudgets,
  appSettings,
  assetSnapshots,
  categoryOrder,
  csvFiles,
  encryptedSecrets,
  members,
  overrides,
  transactions,
  users,
} from '../db/schema';

/**
 * D1 全データテーブルを 1 JSON にダンプして R2 に保存する週 1 backup の中核 lib。
 *
 * 含めない:
 * - `sessions` — 90日 TTL で頻繁に増減し、復元しても cookie 失効済みなので無意味
 * - `sync_log` — 履歴。復元する必然性なし、データ量肥大
 *
 * 含める (復元で家計簿アプリが再起動できる最小集合):
 * - users / app_settings / encrypted_secrets / members / category_order / annual_budgets
 *   / account_anchors / transactions / overrides / asset_snapshots / csv_files
 */

export interface BackupJson {
  schemaVersion: '1';
  generatedAt: string; // ISO8601
  d1DatabaseId: string;
  tables: {
    users: unknown[];
    app_settings: unknown[];
    /**
     * encrypted_secrets は ciphertext / iv が ArrayBuffer (BLOB) で来るので
     * `Array.from(new Uint8Array(...))` で number[] に正規化したものを格納する。
     * 復元時は逆変換が必要 (本 PR ではスコープ外)。
     */
    encrypted_secrets: unknown[];
    members: unknown[];
    category_order: unknown[];
    annual_budgets: unknown[];
    account_anchors: unknown[];
    transactions: unknown[];
    overrides: unknown[];
    asset_snapshots: unknown[];
    csv_files: unknown[];
  };
}

export async function buildBackupJson(db: Database, d1DatabaseId: string): Promise<BackupJson> {
  // 並列で読み出し (drizzle は内部で D1 の prepared statement を使うので並列で問題なし)
  const [
    usersRows,
    appSettingsRows,
    encryptedSecretsRows,
    membersRows,
    categoryOrderRows,
    annualBudgetsRows,
    accountAnchorsRows,
    transactionsRows,
    overridesRows,
    assetSnapshotsRows,
    csvFilesRows,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(appSettings),
    db.select().from(encryptedSecrets),
    db.select().from(members),
    db.select().from(categoryOrder),
    db.select().from(annualBudgets),
    db.select().from(accountAnchors),
    db.select().from(transactions),
    db.select().from(overrides),
    db.select().from(assetSnapshots),
    db.select().from(csvFiles),
  ]);

  return {
    schemaVersion: '1',
    generatedAt: new Date().toISOString(),
    d1DatabaseId,
    tables: {
      users: usersRows,
      app_settings: appSettingsRows,
      encrypted_secrets: encryptedSecretsRows.map(serializeEncryptedSecretRow),
      members: membersRows,
      category_order: categoryOrderRows,
      annual_budgets: annualBudgetsRows,
      account_anchors: accountAnchorsRows,
      transactions: transactionsRows,
      overrides: overridesRows,
      asset_snapshots: assetSnapshotsRows,
      csv_files: csvFilesRows,
    },
  };
}

/** ArrayBuffer (BLOB) を JSON-serializable な number[] に変換する。 */
function serializeEncryptedSecretRow(row: typeof encryptedSecrets.$inferSelect): unknown {
  return {
    ...row,
    ciphertext: Array.from(new Uint8Array(row.ciphertext as ArrayBuffer)),
    iv: Array.from(new Uint8Array(row.iv as ArrayBuffer)),
  };
}

/**
 * UTF-8 文字列を gzip 圧縮した Uint8Array を返す。
 * Workers/Pages Functions の CompressionStream を使う (nodejs_compat 不要)。
 */
export async function gzipString(input: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  const stream = new Response(bytes).body!.pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** `backups/YYYY-MM-DD.json.gz` のキー文字列を生成。UTC ベース。 */
export function backupObjectKey(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `backups/${yyyy}-${mm}-${dd}.json.gz`;
}
