import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiFetch, apiGet, apiPost } from './api';
import { type DbTransaction } from './aggregate';
import { applyOverrideMap, type DbOverride } from './overrides';

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
 * API 取得した取引に D1 真実の overrides を適用したものを返す。
 *
 * transactions と overrides は staleTime / invalidate 周期が違うので
 * `useAllTransactions` と `useOverridesQuery` を別 query として保持。
 *
 * `DbTransaction` 型に統一して返すことで、既存の集計ロジックがそのまま使える。
 */
export function useAppliedTransactions(): {
  data: DbTransaction[];
  isLoading: boolean;
  isError: boolean;
} {
  const txQuery = useAllTransactions();
  const ovQuery = useOverridesQuery();
  const data = useMemo(() => {
    if (!txQuery.data) return [];
    const overrideMap = new Map(
      (ovQuery.data ?? []).map((o): [string, DbOverride] => [o.mfRowId, apiOverrideToMerge(o)]),
    );
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
  }, [txQuery.data, ovQuery.data]);

  return {
    data,
    isLoading: txQuery.isLoading || ovQuery.isLoading,
    isError: txQuery.isError || ovQuery.isError,
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
 * D1 から override 全件を取得する。同 query key の useQuery は dedupe されるので
 * 各 caller (Layout / useAppliedTransactions / useOverrideByMfRowId 等) から
 * 自由に呼んで OK。
 */
export function useOverridesQuery() {
  return useQuery({
    queryKey: ['overrides'],
    queryFn: async () => {
      const res = await apiGet<OverridesResponse>('/api/overrides');
      if (!res.ok) throw new Error(`failed to fetch overrides: ${res.error.status}`);
      return res.data.overrides;
    },
    staleTime: 60 * 1000,
  });
}

/** mfRowId 単独で override を引く。EditTransactionModal 用。 */
export function useOverrideByMfRowId(mfRowId: string | null | undefined): ApiOverride | undefined {
  const { data } = useOverridesQuery();
  return useMemo(() => {
    if (!mfRowId) return undefined;
    return data?.find((o) => o.mfRowId === mfRowId);
  }, [mfRowId, data]);
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

/**
 * `ApiOverride` を `mergeOverride` / `applyOverrideMap` (既存 pure 関数) が
 * 受け付ける `DbOverride` 形に変換。null → undefined に正規化する。
 */
function apiOverrideToMerge(o: ApiOverride): DbOverride {
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
