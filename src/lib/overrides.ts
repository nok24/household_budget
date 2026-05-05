import type { DbTransaction } from './aggregate';

/**
 * 取引上書きの 1 行分。`mergeOverride` / `applyOverrideMap` のキャリア型として使う。
 *
 * D1 の真実は `functions/lib/overridesConfig.ts` の `OverrideRecord` (sourceFileId,
 * mfRowId 複合 PK)。フロントは集計時に「mfRowId 単独」で素早く lookup したいので、
 * `id = mfRowId` のフラットな形に正規化したものをここで扱う (queries.ts の
 * `apiOverrideToMerge` で変換)。
 */
export interface DbOverride {
  id: string; // = MF row ID
  largeCategory?: string;
  midCategory?: string;
  memo?: string;
  isTransferOverride?: boolean;
  excluded?: boolean;
  updatedAt: string; // ISO8601
}

export interface OverrideInput {
  largeCategory?: string;
  midCategory?: string;
  memo?: string;
  isTransferOverride?: boolean;
  excluded?: boolean;
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

/**
 * 取得済みの override Map を transactions に適用する pure 関数。
 * TanStack Query で取得したサーバ取引と D1 真実の overrides を合成するために使う。
 */
export function applyOverrideMap(
  rows: DbTransaction[],
  map: Map<string, DbOverride>,
): DbTransaction[] {
  if (map.size === 0) return rows;
  return rows.map((r) => mergeOverride(r, map.get(r.id)));
}
