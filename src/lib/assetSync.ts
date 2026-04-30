import { db, type DbAssetSnapshot } from './db';
import { downloadFileBytes, listAllFolderChildren } from './drive';
import { looksLikeAssetCsv, parseAssetCsvText } from './assetCsv';
import { decodeCsvBytes } from './csv';

// 資産フォルダの同期。MFの取引フォルダと違って、ファイルは資産推移CSV1〜数本程度
// しか想定しない（妻のエクスポート運用次第）。重複月は最後の取り込み勝ち。

export interface AssetSyncResult {
  total: number;
  fetched: number;
  skipped: number;
  errors: { name: string; message: string }[];
  durationMs: number;
}

export async function syncAssetFolder(
  accessToken: string,
  folderId: string,
): Promise<AssetSyncResult> {
  const startedAt = performance.now();
  const remote = await listAllFolderChildren(accessToken, folderId, { csvOnly: true });
  console.info('[asset-sync] start', {
    folderId,
    fileCount: remote.length,
    files: remote.map((r) => ({ id: r.id, name: r.name, mimeType: r.mimeType })),
  });

  const errors: AssetSyncResult['errors'] = [];
  let fetched = 0;
  let skipped = 0;

  // 月→ファイルID, 日付 のマップを構築しながら、新しい日付で上書きする方針。
  // 同じ月の行が複数ファイルに重複して入っていた場合は「最終日付が新しい行」を採用。
  const monthly = new Map<string, DbAssetSnapshot>();

  for (const file of remote) {
    try {
      const buf = await downloadFileBytes(accessToken, file.id);
      const text = decodeCsvBytes(buf);
      // ヘッダを軽くチェックして資産CSVでなければスキップ（取引CSVが混入していても安全に）
      if (!looksLikeAssetCsv(text)) {
        const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
        console.warn('[asset-sync] skipped (header mismatch)', {
          name: file.name,
          firstLine,
        });
        skipped++;
        continue;
      }
      const snapshots = parseAssetCsvText(text);
      console.info('[asset-sync] parsed', {
        name: file.name,
        snapshots: snapshots.length,
      });
      for (const s of snapshots) {
        const cur = monthly.get(s.yearMonth);
        if (!cur || s.date > cur.date) {
          monthly.set(s.yearMonth, {
            yearMonth: s.yearMonth,
            date: s.date,
            total: s.total,
            savings: s.savings,
            stocks: s.stocks,
            funds: s.funds,
            pension: s.pension,
            points: s.points,
            sourceFileId: file.id,
          });
        }
      }
      fetched++;
    } catch (e) {
      errors.push({
        name: file.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 全置き換え戦略: 既存スナップショットを一掃して新しいセットを書く。
  // データソースが「最新のCSVに乗っている全期間」前提なので部分マージは不要。
  await db.transaction('rw', db.assetSnapshots, db.meta, async () => {
    await db.assetSnapshots.clear();
    if (monthly.size > 0) {
      await db.assetSnapshots.bulkPut([...monthly.values()]);
    }
    await db.meta.put({ key: 'lastAssetSyncedAt', value: new Date().toISOString() });
    await db.meta.put({ key: 'lastAssetFolderId', value: folderId });
  });

  return {
    total: remote.length,
    fetched,
    skipped,
    errors,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

export async function getLastAssetSyncedAt(): Promise<Date | null> {
  const r = await db.meta.get('lastAssetSyncedAt');
  if (!r || typeof r.value !== 'string') return null;
  const d = new Date(r.value);
  return Number.isNaN(d.getTime()) ? null : d;
}
