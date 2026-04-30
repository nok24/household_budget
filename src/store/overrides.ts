import { create } from 'zustand';
import { pullOverridesFromDrive, pushOverridesToDrive } from '@/lib/overridesSync';

type Status = 'idle' | 'syncing' | 'pushing' | 'error';

interface OverridesState {
  status: Status;
  hydrated: boolean;
  lastSyncedAt: Date | null;
  error: string | null;

  hydrate: (accessToken: string, folderId: string) => Promise<void>;
  push: (accessToken: string) => Promise<void>;
  /** デバウンスして Drive に push（モーダル保存後などから呼ぶ） */
  schedulePush: (accessToken: string) => void;
}

let pushTimer: number | null = null;
const PUSH_DEBOUNCE_MS = 1500;

export const useOverridesStore = create<OverridesState>((set, get) => ({
  status: 'idle',
  hydrated: false,
  lastSyncedAt: null,
  error: null,

  async hydrate(accessToken, folderId) {
    if (get().status === 'syncing') return;
    set({ status: 'syncing', error: null });
    try {
      await pullOverridesFromDrive(accessToken, folderId);
      set({
        status: 'idle',
        hydrated: true,
        lastSyncedAt: new Date(),
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  async push(accessToken) {
    set({ status: 'pushing', error: null });
    try {
      await pushOverridesToDrive(accessToken);
      set({
        status: 'idle',
        lastSyncedAt: new Date(),
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  schedulePush(accessToken) {
    if (pushTimer != null) {
      window.clearTimeout(pushTimer);
    }
    pushTimer = window.setTimeout(() => {
      pushTimer = null;
      void get().push(accessToken);
    }, PUSH_DEBOUNCE_MS);
  },
}));
