import { db, type DbOverride, type DbTransaction } from './db';

// Step 5 で `db.ts` を撤去する際に `DbOverride` 型をここに移動する予定。
// それまでは re-export して caller (queries.ts 等) が `@/lib/overrides` から取れるように。
export type { DbOverride };

export interface OverrideInput {
  largeCategory?: string;
  midCategory?: string;
  memo?: string;
  isTransferOverride?: boolean;
  excluded?: boolean;
}

export async function getOverride(id: string): Promise<DbOverride | undefined> {
  return db.overrides.get(id);
}

export async function getOverridesByIds(ids: string[]): Promise<Map<string, DbOverride>> {
  if (ids.length === 0) return new Map();
  const list = await db.overrides.where('id').anyOf(ids).toArray();
  return new Map(list.map((o) => [o.id, o]));
}

export async function upsertOverride(id: string, input: OverrideInput): Promise<void> {
  // 全項目が空（or undefined）なら削除と等価
  const allEmpty =
    input.largeCategory === undefined &&
    input.midCategory === undefined &&
    input.memo === undefined &&
    input.isTransferOverride === undefined &&
    input.excluded === undefined;
  if (allEmpty) {
    await db.overrides.delete(id);
    return;
  }
  await db.overrides.put({
    id,
    ...input,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearOverride(id: string): Promise<void> {
  await db.overrides.delete(id);
}

/**
 * Override 値を transaction にマージして返す（isTarget の `excluded` 反映も含む）。
 */
export function mergeOverride(t: DbTransaction, ov: DbOverride | undefined): DbTransaction {
  if (!ov) return t;
  return {
    ...t,
    largeCategory: ov.largeCategory ?? t.largeCategory,
    midCategory: ov.midCategory ?? t.midCategory,
    memo: ov.memo ?? t.memo,
    isTransfer: ov.isTransferOverride !== undefined ? ov.isTransferOverride : t.isTransfer,
    isTarget: ov.excluded === true ? false : t.isTarget,
  };
}

export async function applyOverridesToRows(rows: DbTransaction[]): Promise<DbTransaction[]> {
  const map = await getOverridesByIds(rows.map((r) => r.id));
  if (map.size === 0) return rows;
  return rows.map((r) => mergeOverride(r, map.get(r.id)));
}

/**
 * 既に取得済みの override Map を transactions に適用する pure 関数。
 * TanStack Query 経由で取得したサーバ取引と Dexie の overrides を
 * フロントで合成するために使う。
 */
export function applyOverrideMap(
  rows: DbTransaction[],
  map: Map<string, DbOverride>,
): DbTransaction[] {
  if (map.size === 0) return rows;
  return rows.map((r) => mergeOverride(r, map.get(r.id)));
}

export async function hasOverride(id: string): Promise<boolean> {
  const ov = await db.overrides.get(id);
  return !!ov;
}
