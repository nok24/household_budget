import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { apiGet, apiPost } from './api';
import { db, type DbTransaction } from './db';
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
