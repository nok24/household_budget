import { create } from 'zustand';
import type { SyncResult } from '@/lib/sync';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  lastResult: SyncResult | null;
  lastSyncedAt: Date | null;
  error: string | null;

  beginSync: () => void;
  finishSync: (result: SyncResult) => void;
  failSync: (error: string) => void;
  hydrate: (lastSyncedAt: Date | null) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  lastResult: null,
  lastSyncedAt: null,
  error: null,

  beginSync: () => set({ status: 'syncing', error: null }),
  finishSync: (lastResult) =>
    set({
      status: 'idle',
      lastResult,
      lastSyncedAt: new Date(),
      error: null,
    }),
  failSync: (error) => set({ status: 'error', error }),
  hydrate: (lastSyncedAt) => set({ lastSyncedAt }),
}));
