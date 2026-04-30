import { transfer, wrap, type Remote } from 'comlink';
import { db, type DbFile, type DbTransaction } from './db';
import { downloadFileBytes, listAllFolderChildren } from './drive';
import type { CsvWorkerApi } from '@/workers/csvWorker';

// CSV パース Worker は singleton。lazy 初期化。
let workerRef: Worker | null = null;
let apiRef: Remote<CsvWorkerApi> | null = null;

function getCsvWorker(): Remote<CsvWorkerApi> {
  if (!apiRef) {
    workerRef = new Worker(new URL('../workers/csvWorker.ts', import.meta.url), {
      type: 'module',
    });
    apiRef = wrap<CsvWorkerApi>(workerRef);
  }
  return apiRef;
}

export interface SyncResult {
  total: number;        // フォルダ内のCSV件数
  fetched: number;      // 今回ダウンロード+パースした件数
  skipped: number;      // 変更なしでスキップした件数
  removed: number;      // Drive側から消えたためローカルからも削除した件数
  errors: { name: string; message: string }[];
  durationMs: number;
}

export async function syncDriveFolder(
  accessToken: string,
  folderId: string,
): Promise<SyncResult> {
  const startedAt = performance.now();
  const remote = await listAllFolderChildren(accessToken, folderId, { csvOnly: true });
  const localList = await db.files.toArray();
  const localById = new Map(localList.map((f) => [f.driveFileId, f]));

  const toFetch = remote.filter((r) => {
    const l = localById.get(r.id);
    return !l || l.modifiedTime !== r.modifiedTime;
  });

  const errors: SyncResult['errors'] = [];
  let fetched = 0;
  const csvApi = getCsvWorker();

  for (const file of toFetch) {
    try {
      const buf = await downloadFileBytes(accessToken, file.id);
      // ArrayBuffer を Worker に transfer（コピー回避）
      const rows = await csvApi.parseCsv(transfer(buf, [buf]));

      await db.transaction('rw', db.transactions, db.files, async () => {
        // このファイル由来の既存レコードを一旦消す（再取り込み時の整合用）
        await db.transactions.where('sourceFileId').equals(file.id).delete();

        const txs: DbTransaction[] = rows
          .filter((r) => r.id) // ID無し行は捨てる（保険）
          .map((r) => ({
            id: r.id,
            date: r.date,
            yearMonth: r.date ? r.date.slice(0, 7) : '',
            amount: r.amount,
            contentName: r.contentName,
            account: r.account,
            largeCategory: r.largeCategory,
            midCategory: r.midCategory,
            memo: r.memo,
            isTarget: r.isTarget,
            isTransfer: r.isTransfer,
            sourceFileId: file.id,
          }));

        await db.transactions.bulkPut(txs);

        const fileRec: DbFile = {
          driveFileId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          parsedAt: new Date().toISOString(),
          rowCount: txs.length,
        };
        await db.files.put(fileRec);
      });
      fetched++;
    } catch (e) {
      errors.push({
        name: file.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Drive 側から消えたファイル → ローカルからも除去
  const remoteIds = new Set(remote.map((r) => r.id));
  const orphanFiles = localList.filter((l) => !remoteIds.has(l.driveFileId));
  for (const o of orphanFiles) {
    await db.transaction('rw', db.transactions, db.files, async () => {
      await db.transactions.where('sourceFileId').equals(o.driveFileId).delete();
      await db.files.delete(o.driveFileId);
    });
  }

  const now = new Date();
  await db.meta.put({ key: 'lastSyncedAt', value: now.toISOString() });
  await db.meta.put({ key: 'lastFolderId', value: folderId });

  return {
    total: remote.length,
    fetched,
    skipped: remote.length - toFetch.length,
    removed: orphanFiles.length,
    errors,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

export async function getLastSyncedAt(): Promise<Date | null> {
  const r = await db.meta.get('lastSyncedAt');
  if (!r || typeof r.value !== 'string') return null;
  const d = new Date(r.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getTransactionCount(): Promise<number> {
  return db.transactions.count();
}

export async function getFileCount(): Promise<number> {
  return db.files.count();
}
