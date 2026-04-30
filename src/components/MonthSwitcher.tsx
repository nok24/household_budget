import dayjs from 'dayjs';
import { useUiStore } from '@/store/ui';

export default function MonthSwitcher() {
  const selectedMonth = useUiStore((s) => s.selectedMonth);
  const shift = useUiStore((s) => s.shiftMonth);
  const setSelectedMonth = useUiStore((s) => s.setSelectedMonth);

  const prev = dayjs(`${selectedMonth}-01`).subtract(1, 'month');
  const next = dayjs(`${selectedMonth}-01`).add(1, 'month');
  const thisMonth = dayjs().format('YYYY-MM');
  const isCurrent = selectedMonth === thisMonth;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => shift(-1)}
        className="px-3 py-1.5 text-xs bg-surface border border-line rounded-md text-ink-60 hover:text-ink hover:bg-canvas transition-colors"
      >
        ← {prev.format('M月')}
      </button>
      <button
        type="button"
        onClick={() => setSelectedMonth(thisMonth)}
        disabled={isCurrent}
        className="px-3 py-1.5 text-xs bg-surface border border-line rounded-md text-ink-60 hover:text-ink hover:bg-canvas transition-colors disabled:opacity-40 disabled:cursor-default"
        title="今月に戻る"
      >
        今月
      </button>
      <button
        type="button"
        onClick={() => shift(1)}
        className="px-3 py-1.5 text-xs bg-surface border border-line rounded-md text-ink-40 hover:text-ink hover:bg-canvas transition-colors"
      >
        {next.format('M月')} →
      </button>
    </div>
  );
}
