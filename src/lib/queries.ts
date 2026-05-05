import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo } from 'react';
import { apiFetch, apiGet, apiPost } from './api';
import { db, type DbOverride, type DbTransaction } from './db';
import { applyOverrideMap } from './overrides';

/**
 * Worker から返ってくる取引行。`functions/routes/transactions.ts` の serializer と一致させること。
 * `id` は MF row ID (フロント既存の `DbTransaction.id` と互換)。
 */
export interface ApiTransaction {
  id: string;
  surrogateId: number;
  sourceFileId: string;
  date: string;
  yearMonth: string;
  amount: number;
  contentName: string;
  account: string;
  largeCategory: string;
  midCategory: string;
  memo: string;
  isTarget: boolean;
  isTransfer: boolean;
}

interface AllTransactionsResponse {
  transactions: ApiTransaction[];
}

/**
 * D1 から全取引を取得する。家庭利用なので 1 ペイロードで取り切る。
 * 同期成功時にこのクエリを invalidate して再取得する。
 */
export function useAllTransactions() {
  return useQuery({
    queryKey: ['transactions', 'all'],
    queryFn: async () => {
      const res = await apiGet<AllTransactionsResponse>('/api/transactions/all');
      if (!res.ok) throw new Error(`failed to fetch transactions: ${res.error.status}`);
      return res.data.transactions;
    },
    staleTime: 60 * 1000, // 1 分は再取得しない
  });
}

/**
 * API 取得した取引に Dexie の overrides を適用したものを返す。
 * overrides は Phase 4 で D1 に移すまで Dexie 管理のままなのでここで合成する。
 *
 * `DbTransaction` 型に統一して返すことで、既存の集計ロジックがそのまま使える。
 */
export function useAppliedTransactions(): {
  data: DbTransaction[];
  isLoading: boolean;
  isError: boolean;
} {
  const txQuery = useAllTransactions();
  const overridesArr = useLiveQuery(() => db.overrides.toArray(), []);
  const data = useMemo(() => {
    if (!txQuery.data) return [];
    const overrideMap = new Map((overridesArr ?? []).map((o) => [o.id, o]));
    // ApiTransaction → DbTransaction (id は MF row ID で互換)
    const rows: DbTransaction[] = txQuery.data.map((t) => ({
      id: t.id,
      sourceFileId: t.sourceFileId,
      date: t.date,
      yearMonth: t.yearMonth,
      amount: t.amount,
      contentName: t.contentName,
      account: t.account,
      largeCategory: t.largeCategory,
      midCategory: t.midCategory,
      memo: t.memo,
      isTarget: t.isTarget,
      isTransfer: t.isTransfer,
    }));
    return applyOverrideMap(rows, overrideMap);
  }, [txQuery.data, overridesArr]);

  return {
    data,
    isLoading: txQuery.isLoading,
    isError: txQuery.isError,
  };
}

interface SyncLog {
  id: number;
  kind: string;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  finishedAt: number | null;
  fetched: number | null;
  errorsJson: string | null;
}

interface SyncStatusResponse {
  lastLog: SyncLog | null;
  lastAssetLog: SyncLog | null;
  lastSyncedAt: number | null;
  lastAssetSyncedAt: number | null;
  transactionCount: number;
  fileCount: number;
  assetSnapshotCount: number;
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ['sync', 'status'],
    queryFn: async () => {
      const res = await apiGet<SyncStatusResponse>('/api/sync/status');
      if (!res.ok) throw new Error(`failed to fetch sync status: ${res.error.status}`);
      return res.data;
    },
    staleTime: 30 * 1000,
  });
}

interface SyncTransactionsResponse {
  ok: true;
  total: number;
  fetched: number;
  skipped: number;
  removed: number;
  errors: Array<{ name: string; message: string }>;
}

export function useSyncTransactionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiPost<SyncTransactionsResponse>('/api/sync/transactions');
      if (!res.ok) {
        const body = res.error.body as { error?: string } | null;
        throw new Error(body?.error || `sync failed (${res.error.status})`);
      }
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['sync', 'status'] });
    },
  });
}

export interface ApiAssetSnapshot {
  yearMonth: string;
  date: string;
  total: number;
  savings: number;
  stocks: number;
  funds: number;
  pension: number;
  points: number;
}

interface AssetSnapshotsResponse {
  snapshots: ApiAssetSnapshot[];
}

export function useAssetSnapshots() {
  return useQuery({
    queryKey: ['assets', 'snapshots'],
    queryFn: async () => {
      const res = await apiGet<AssetSnapshotsResponse>('/api/assets/snapshots');
      if (!res.ok) throw new Error(`failed to fetch asset snapshots: ${res.error.status}`);
      return res.data.snapshots;
    },
    staleTime: 60 * 1000,
  });
}

interface SyncAssetsResponse {
  ok: true;
  total: number;
  fetched: number;
  skipped: number;
  monthlySnapshots: number;
  errors: Array<{ name: string; message: string }>;
}

export function useSyncAssetsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiPost<SyncAssetsResponse>('/api/sync/assets');
      if (!res.ok) {
        const body = res.error.body as { error?: string } | null;
        throw new Error(body?.error || `sync failed (${res.error.status})`);
      }
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['sync', 'status'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Overrides (Phase 3 PR-F): D1 真実 + Dexie ミラー (PR-G で Dexie 廃止予定)
// ─────────────────────────────────────────────────────────────

/** Worker `functions/lib/overridesConfig.ts` の OverrideRecord と一致 */
export interface ApiOverride {
  sourceFileId: string;
  mfRowId: string;
  largeCategory: string | null;
  midCategory: string | null;
  memo: string | null;
  isTransferOverride: boolean | null;
  excluded: boolean | null;
  updatedBy: string | null;
  updatedAt: number;
}

interface OverridesResponse {
  overrides: ApiOverride[];
}

interface OverrideMutationResponse {
  override: ApiOverride;
}

export interface OverrideUpsertInput {
  sourceFileId: string;
  mfRowId: string;
  largeCategory?: string | null;
  midCategory?: string | null;
  memo?: string | null;
  isTransferOverride?: boolean | null;
  excluded?: boolean | null;
}

export interface OverrideKey {
  sourceFileId: string;
  mfRowId: string;
}

/**
 * D1 から override 全件を取得し、Dexie に全置換でミラーする。
 *
 * `useAppliedTransactions` / `getMonthSummary` 等 既存集計が `db.overrides` を
 * `useLiveQuery` で読んでいるため、PR-G で Dexie 廃止までこのミラーを維持する。
 * Dexie ID は旧 `DbOverride.id = mfRowId` 互換のまま (mfRowId 単独)。
 */
export function useOverridesQuery() {
  const query = useQuery({
    queryKey: ['overrides'],
    queryFn: async () => {
      const res = await apiGet<OverridesResponse>('/api/overrides');
      if (!res.ok) throw new Error(`failed to fetch overrides: ${res.error.status}`);
      return res.data.overrides;
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!query.data) return;
    const apiRows = query.data;
    void (async () => {
      const dexieRows: DbOverride[] = apiRows.map((o) => toDbOverride(o));
      await db.transaction('rw', db.overrides, async () => {
        await db.overrides.clear();
        if (dexieRows.length > 0) {
          await db.overrides.bulkPut(dexieRows);
        }
      });
    })();
  }, [query.data]);

  return query;
}

/** mfRowId 単独で override を引く。新フックの利用先 (EditTransactionModal) 用。 */
export function useOverrideByMfRowId(mfRowId: string | null | undefined): ApiOverride | undefined {
  const overrides = useOverridesCache();
  return useMemo(() => {
    if (!mfRowId) return undefined;
    return overrides?.find((o) => o.mfRowId === mfRowId);
  }, [mfRowId, overrides]);
}

function useOverridesCache(): ApiOverride[] | undefined {
  // useQuery のキャッシュをそのまま参照したいだけなので useQuery を再呼び出し (重複 fetch にはならない)
  const q = useQuery<ApiOverride[]>({
    queryKey: ['overrides'],
    enabled: false, // fetch しない (上の useOverridesQuery が走っている前提)
    staleTime: 60 * 1000,
  });
  return q.data;
}

export function useUpsertOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OverrideUpsertInput) => {
      const res = await apiFetch<OverrideMutationResponse>('/api/overrides', {
        method: 'PUT',
        body: input,
      });
      if (!res.ok) {
        const body = res.error.body as { error?: string } | null;
        throw new Error(body?.error || `upsert failed (${res.error.status})`);
      }
      return res.data.override;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['overrides'] });
    },
  });
}

export function useDeleteOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: OverrideKey) => {
      const res = await apiFetch<null>('/api/overrides', {
        method: 'DELETE',
        body: key,
      });
      if (!res.ok) {
        const body = res.error.body as { error?: string } | null;
        throw new Error(body?.error || `delete failed (${res.error.status})`);
      }
      return key;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['overrides'] });
    },
  });
}

function toDbOverride(o: ApiOverride): DbOverride {
  // Dexie 側の DbOverride は旧 schema (id = mfRowId, optional フィールド)。
  // null → undefined に正規化して既存の mergeOverride / applyOverrideMap が
  // 「未設定」として扱えるようにする。
  const base: DbOverride = {
    id: o.mfRowId,
    updatedAt: new Date(o.updatedAt).toISOString(),
  };
  if (o.largeCategory !== null) base.largeCategory = o.largeCategory;
  if (o.midCategory !== null) base.midCategory = o.midCategory;
  if (o.memo !== null) base.memo = o.memo;
  if (o.isTransferOverride !== null) base.isTransferOverride = o.isTransferOverride;
  if (o.excluded !== null) base.excluded = o.excluded;
  return base;
}
