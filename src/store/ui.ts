import dayjs from 'dayjs';
import { create } from 'zustand';

interface UiState {
  selectedMonth: string; // YYYY-MM
  setSelectedMonth: (ym: string) => void;
  shiftMonth: (delta: number) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  selectedMonth: dayjs().format('YYYY-MM'),
  setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
  shiftMonth: (delta) => {
    const next = dayjs(`${get().selectedMonth}-01`).add(delta, 'month').format('YYYY-MM');
    set({ selectedMonth: next });
  },
}));
