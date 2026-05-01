import { db, type DbAssetSnapshot } from './db';
import { shiftMonth } from './aggregate';

export async function getAssetSnapshot(yearMonth: string): Promise<DbAssetSnapshot | null> {
  const r = await db.assetSnapshots.get(yearMonth);
  return r ?? null;
}

/**
 * 指定月のスナップショットを返す。当月にデータが無ければ、それ以前で最も近い月のスナップショット
 * を fallback として返す（残高は連続値なので最新の月末値で代用しても合理的）。
 */
export async function getAssetSnapshotOrLatestBefore(
  yearMonth: string,
): Promise<DbAssetSnapshot | null> {
  const exact = await db.assetSnapshots.get(yearMonth);
  if (exact) return exact;
  const all = await db.assetSnapshots.toArray();
  const before = all
    .filter((s) => s.yearMonth <= yearMonth)
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1));
  return before[0] ?? null;
}

export interface AssetDelta {
  total: number;
  savings: number;
  stocks: number;
  funds: number;
  pension: number;
  points: number;
}

/**
 * 指定月と前月のスナップショット差分。どちらか欠けていれば null。
 */
export async function getAssetDelta(yearMonth: string): Promise<AssetDelta | null> {
  const cur = await getAssetSnapshot(yearMonth);
  const prev = await getAssetSnapshot(shiftMonth(yearMonth, -1));
  if (!cur || !prev) return null;
  return {
    total: cur.total - prev.total,
    savings: cur.savings - prev.savings,
    stocks: cur.stocks - prev.stocks,
    funds: cur.funds - prev.funds,
    pension: cur.pension - prev.pension,
    points: cur.points - prev.points,
  };
}
