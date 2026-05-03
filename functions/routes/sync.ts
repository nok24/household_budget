import { Hono } from 'hono';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AppBindings } from '../types';
import { requireAuth } from '../lib/authMiddleware';
import { getDb, type Database } from '../lib/db';
import { csvFiles, syncLog, transactions, overrides } from '../db/schema';
import { SETTING_KEYS, getSetting, putSetting } from '../lib/appSettings';
import {
  DriveApiError,
  DriveNotConnectedError,
  downloadFileBytes,
  listCsvFilesInFolder,
  type DriveCsvFile,
} from '../lib/driveClient';
import { decodeAndParseTransactionsCsv } from '../lib/csv/mfTransactions';

export const syncRouter = new Hono<AppBindings>();

// 同期はログイン済みなら誰でも実行できる (admin 限定にしない)。家族メンバーが触る前提。
syncRouter.use('*', requireAuth);

const SYNC_LOCK_STALE_MS = 10 * 60 * 1000; // 10 分以上 running なら stale 判定

// D1 の bound parameter 制限は 100 / クエリ。transactions の INSERT は 13 列なので、
// 100 / 13 = 7 行まで。安全のため 7 で固定。
const TX_INSERT_CHUNK = 7;

/**
 * Error.cause を辿って実エラー (D1 の reason 等) を文字列に展開する。
 * drizzle は message に SQL を入れて cause に元エラーを格納するので、
 * message だけだと SQL ダンプしか残らず原因が分からない。
 */
function formatErrorChain(e: unknown, contextName: string): string {
  const parts: string[] = [];
  let current: unknown = e;
  let depth = 0;
  while (current && depth < 5) {
    if (current instanceof Error) {
      // SQL は冗長すぎるので message は先頭 200 文字に切る
      const head = current.message.slice(0, 200);
      parts.push(`${current.name}: ${head}${current.message.length > 200 ? '…' : ''}`);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
    depth++;
  }
  return parts.length > 0 ? parts.join(' | ') : `unknown error (${contextName})`;
}

interface SyncResult {
  total: number;
  fetched: number;
  skipped: number;
  removed: number;
  errors: Array<{ name: string; message: string }>;
}

/**
 * 取引 CSV をフォルダから取り込んで D1 transactions に upsert する。
 * - sync_log の running 行で重複実行をロック (10 分超 stale なら新規許可)
 * - 差分: csv_files.modifiedTime と Drive 側 modifiedTime を比較
 * - 失効: Drive 側から消えた CSV はその source_file_id 配下の transactions ごと削除 (overrides もカスケード)
 */
syncRouter.post('/transactions', async (c) => {
  const db = getDb(c.env);

  // 1. lock check
  const recentRunning = await db
    .select()
    .from(syncLog)
    .where(and(eq(syncLog.kind, 'transactions'), eq(syncLog.status, 'running')))
    .orderBy(desc(syncLog.startedAt))
    .limit(1);
  const stale = recentRunning[0] && Date.now() - recentRunning[0].startedAt > SYNC_LOCK_STALE_MS;
  if (recentRunning[0] && !stale) {
    return c.json({ error: 'sync_in_progress', startedAt: recentRunning[0].startedAt }, 409);
  }

  const folderId = await getSetting(db, SETTING_KEYS.BUDGET_FOLDER_ID);
  if (!folderId) {
    return c.json({ error: 'budget_folder_not_set' }, 400);
  }

  // 2. running ログ追加
  const startedAt = Date.now();
  const inserted = await db
    .insert(syncLog)
    .values({ kind: 'transactions', status: 'running', startedAt })
    .returning({ id: syncLog.id });
  const logId = inserted[0]!.id;

  try {
    const result = await syncTransactions(db, c.env, folderId);

    // 3. last synced + success ログ
    await putSetting(db, SETTING_KEYS.LAST_SYNCED_TRANSACTIONS_AT, String(Date.now()));
    await db
      .update(syncLog)
      .set({
        status: 'success',
        finishedAt: Date.now(),
        fetched: result.fetched,
        errorsJson: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      })
      .where(eq(syncLog.id, logId));

    return c.json({ ok: true, ...result });
  } catch (e) {
    await db
      .update(syncLog)
      .set({
        status: 'error',
        finishedAt: Date.now(),
        errorsJson: JSON.stringify([
          { name: '__sync__', message: e instanceof Error ? e.message : String(e) },
        ]),
      })
      .where(eq(syncLog.id, logId));

    if (e instanceof DriveNotConnectedError) {
      return c.json({ error: 'drive_not_connected' }, 409);
    }
    if (e instanceof DriveApiError) {
      console.error('[sync/transactions] drive api error', e.status, e.body);
      return c.json({ error: 'drive_api_error', status: e.status }, 502);
    }
    throw e;
  }
});

async function syncTransactions(
  db: Database,
  env: AppBindings['Bindings'],
  folderId: string,
): Promise<SyncResult> {
  const remoteFiles = await listCsvFilesInFolder(db, env, folderId);

  const localFiles = await db.select().from(csvFiles).where(eq(csvFiles.kind, 'transactions'));
  const localById = new Map(localFiles.map((f) => [f.driveFileId, f]));

  const toFetch = remoteFiles.filter((r) => {
    const l = localById.get(r.id);
    return !l || l.modifiedTime !== r.modifiedTime;
  });

  const errors: SyncResult['errors'] = [];
  let fetched = 0;

  for (const file of toFetch) {
    try {
      await ingestSingleCsv(db, env, file);
      fetched++;
    } catch (e) {
      // drizzle は cause に元の D1Error を入れて投げる。message だけだと SQL ダンプだけになる。
      const message = formatErrorChain(e, file.name);
      console.error('[sync/transactions] file ingest failed', file.name, e);
      errors.push({ name: file.name, message });
    }
  }

  // 4. orphan files (Drive から消えた): transactions と overrides を削除
  const remoteIds = new Set(remoteFiles.map((r) => r.id));
  const orphanFileIds = localFiles
    .filter((l) => !remoteIds.has(l.driveFileId))
    .map((l) => l.driveFileId);
  for (const orphanId of orphanFileIds) {
    await deleteFileTransactions(db, orphanId);
    await db.delete(csvFiles).where(eq(csvFiles.driveFileId, orphanId));
  }

  return {
    total: remoteFiles.length,
    fetched,
    skipped: remoteFiles.length - toFetch.length,
    removed: orphanFileIds.length,
    errors,
  };
}

async function ingestSingleCsv(
  db: Database,
  env: AppBindings['Bindings'],
  file: DriveCsvFile,
): Promise<void> {
  const buf = await downloadFileBytes(db, env, file.id);
  const rows = decodeAndParseTransactionsCsv(buf);

  // このファイル由来の transactions を一旦全消し → 一括挿入。
  // overrides は (source_file_id, mf_row_id) のコンボで再リンクできるように後段で処理する案もあるが、
  // overrides は Phase 4 まで本格運用しないので Phase 3 PR-B 段階では shapelock 簡易運用とする。
  await deleteFileTransactions(db, file.id);

  if (rows.length > 0) {
    const records = rows.map((r) => ({
      mfRowId: r.id,
      sourceFileId: file.id,
      date: r.date,
      yearMonth: r.date ? r.date.slice(0, 7) : '',
      amount: r.amount,
      contentName: r.contentName || null,
      account: r.account || null,
      largeCategory: r.largeCategory || null,
      midCategory: r.midCategory || null,
      memo: r.memo || null,
      isTarget: r.isTarget ? 1 : 0,
      isTransfer: r.isTransfer ? 1 : 0,
    }));
    for (let i = 0; i < records.length; i += TX_INSERT_CHUNK) {
      await db.insert(transactions).values(records.slice(i, i + TX_INSERT_CHUNK));
    }
  }

  await db
    .insert(csvFiles)
    .values({
      driveFileId: file.id,
      kind: 'transactions',
      name: file.name,
      modifiedTime: file.modifiedTime,
      parsedAt: Date.now(),
      rowCount: rows.length,
    })
    .onConflictDoUpdate({
      target: csvFiles.driveFileId,
      set: {
        name: file.name,
        modifiedTime: file.modifiedTime,
        parsedAt: Date.now(),
        rowCount: rows.length,
      },
    });
}

/**
 * 指定 source_file_id 配下の transactions を削除する。
 * overrides は FK が ON DELETE CASCADE 無しなので、先に消してからにする。
 */
async function deleteFileTransactions(db: Database, sourceFileId: string): Promise<void> {
  // 該当 transactions の id を取る
  const ids = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.sourceFileId, sourceFileId));
  if (ids.length > 0) {
    const idValues = ids.map((r) => r.id);
    // overrides を chunk で削除 (IN リスト過大対策)
    const CHUNK = 200;
    for (let i = 0; i < idValues.length; i += CHUNK) {
      await db
        .delete(overrides)
        .where(inArray(overrides.transactionId, idValues.slice(i, i + CHUNK)));
    }
  }
  await db.delete(transactions).where(eq(transactions.sourceFileId, sourceFileId));
}

// ─────────────────────────────────────────────────────────────
// 同期状態の照会
// ─────────────────────────────────────────────────────────────

syncRouter.get('/status', async (c) => {
  const db = getDb(c.env);
  // 直近の transactions 同期
  const lastTx = await db
    .select()
    .from(syncLog)
    .where(eq(syncLog.kind, 'transactions'))
    .orderBy(desc(syncLog.startedAt))
    .limit(1);
  // 取引総数 + ファイル数を併せて返す (UI 表示用)
  const counts = await db
    .select({
      txCount: sql<number>`count(*)`,
    })
    .from(transactions);
  const fileCounts = await db
    .select({
      fileCount: sql<number>`count(*)`,
    })
    .from(csvFiles)
    .where(eq(csvFiles.kind, 'transactions'));
  const lastSyncedAt = await getSetting(db, SETTING_KEYS.LAST_SYNCED_TRANSACTIONS_AT);

  return c.json({
    lastLog: lastTx[0] ?? null,
    lastSyncedAt: lastSyncedAt ? Number(lastSyncedAt) : null,
    transactionCount: counts[0]?.txCount ?? 0,
    fileCount: fileCounts[0]?.fileCount ?? 0,
  });
});
