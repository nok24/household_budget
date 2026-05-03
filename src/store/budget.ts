import { create } from 'zustand';
import type { BudgetConfig } from '@/types';
import { apiFetch, apiGet } from '@/lib/api';

type Status = 'idle' | 'loading' | 'saving' | 'error';

interface BudgetState {
  status: Status;
  config: BudgetConfig | null;
  error: string | null;
  isDirty: boolean;

  /** D1 から最新の予算設定を取得して store に流し込む */
  hydrate: () => Promise<void>;
  setConfig: (updater: (prev: BudgetConfig) => BudgetConfig) => void;
  /** 現在の config を D1 に PUT する */
  save: () => Promise<void>;
  reset: () => void;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  status: 'idle',
  config: null,
  error: null,
  isDirty: false,

  async hydrate() {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    const res = await apiGet<BudgetConfig>('/api/budget');
    if (res.ok) {
      set({ config: res.data, status: 'idle', isDirty: false });
    } else {
      set({
        status: 'error',
        error: `failed to load budget: ${res.error.status}`,
      });
    }
  },

  setConfig(updater) {
    const prev = get().config;
    if (!prev) return;
    set({ config: updater(prev), isDirty: true });
  },

  async save() {
    const { config } = get();
    if (!config) return;
    set({ status: 'saving', error: null });
    const res = await apiFetch<BudgetConfig>('/api/budget', {
      method: 'PUT',
      body: config,
    });
    if (res.ok) {
      set({ config: res.data, status: 'idle', isDirty: false });
    } else {
      const body = res.error.body as { error?: string; detail?: string } | null;
      set({
        status: 'error',
        error: body?.detail ?? body?.error ?? `failed to save budget: ${res.error.status}`,
      });
    }
  },

  reset() {
    set({
      status: 'idle',
      config: null,
      error: null,
      isDirty: false,
    });
  },
}));
