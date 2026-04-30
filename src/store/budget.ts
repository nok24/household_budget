import { create } from 'zustand';
import type { BudgetConfig } from '@/types';
import { loadOrInitBudget, saveBudget } from '@/lib/budget';

type Status = 'idle' | 'loading' | 'saving' | 'error';

interface BudgetState {
  status: Status;
  config: BudgetConfig | null;
  fileId: string | null;
  modifiedTime: string | null;
  error: string | null;
  isDirty: boolean;

  hydrate: (accessToken: string, folderId: string) => Promise<void>;
  setConfig: (updater: (prev: BudgetConfig) => BudgetConfig) => void;
  save: (accessToken: string) => Promise<void>;
  reset: () => void;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  status: 'idle',
  config: null,
  fileId: null,
  modifiedTime: null,
  error: null,
  isDirty: false,

  async hydrate(accessToken, folderId) {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    try {
      const { config, meta } = await loadOrInitBudget(accessToken, folderId);
      set({
        config,
        fileId: meta.id,
        modifiedTime: meta.modifiedTime,
        status: 'idle',
        isDirty: false,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  setConfig(updater) {
    const prev = get().config;
    if (!prev) return;
    set({ config: updater(prev), isDirty: true });
  },

  async save(accessToken) {
    const { config, fileId } = get();
    if (!config || !fileId) return;
    set({ status: 'saving', error: null });
    try {
      const meta = await saveBudget(accessToken, fileId, config);
      set({
        modifiedTime: meta.modifiedTime,
        status: 'idle',
        isDirty: false,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  reset() {
    set({
      status: 'idle',
      config: null,
      fileId: null,
      modifiedTime: null,
      error: null,
      isDirty: false,
    });
  },
}));
