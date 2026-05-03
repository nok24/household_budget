import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import MonthSwitcher from '@/components/MonthSwitcher';
import PaceBadge from '@/components/PaceBadge';
import ProgressBar from '@/components/ProgressBar';
import { useBudgetStore } from '@/store/budget';
import { useUiStore } from '@/store/ui';
import {
  getAnnualBudget,
  getAnnualTotalBudget,
  getExpectedPaceAtMonth,
  judgePace,
  orderCategories,
} from '@/lib/budget';
import {
  getCategoryBreakdown,
  getCategoryBreakdownYTD,
  getDistinctLargeCategoriesApplied,
  getYear,
  getYearToDateSummary,
} from '@/lib/aggregate';
import { colorForCategory } from '@/lib/categories';
import { cn, formatYen, formatPct } from '@/lib/utils';

export default function Budget() {
  const status = useBudgetStore((s) => s.status);
  const config = useBudgetStore((s) => s.config);
  const error = useBudgetStore((s) => s.error);
  const isDirty = useBudgetStore((s) => s.isDirty);
  const hydrate = useBudgetStore((s) => s.hydrate);
  const save = useBudgetStore((s) => s.save);

  const selectedMonth = useUiStore((s) => s.selectedMonth);

  // ログイン済みなら D1 から取得
  useEffect(() => {
    if (config) return;
    void hydrate();
  }, [config, hydrate]);

  async function onSave() {
    await save();
  }

  if (status === 'error' && !config) {
    return (
      <div className="space-y-4">
        <Header selectedMonth={selectedMonth} />
        <div className="card p-8 text-center text-sm text-rose-700">
          {error ?? '予算データの取得に失敗しました'}
        </div>
      </div>
    );
  }

  if (status === 'loading' || !config) {
    return (
      <div className="space-y-4">
        <Header selectedMonth={selectedMonth} />
        <div className="card p-8 text-center text-sm text-ink-60">
          {status === 'error' ? `エラー: ${error}` : 'budget.json を読み込み中…'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header
        selectedMonth={selectedMonth}
        onSave={() => void onSave()}
        saving={status === 'saving'}
        isDirty={isDirty}
        error={error}
      />
      <BudgetEditor selectedMonth={selectedMonth} />
    </div>
  );
}

function Header({
  selectedMonth,
  onSave,
  saving,
  isDirty,
  error,
}: {
  selectedMonth: string;
  onSave?: () => void;
  saving?: boolean;
  isDirty?: boolean;
  error?: string | null;
}) {
  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[11px] tracking-[0.1em] text-ink-40 mb-1">BUDGET</div>
        <h1 className="text-2xl font-medium leading-tight">
          {dayjs(`${selectedMonth}-01`).format('YYYY年 M月')} の予算
        </h1>
        <p className="text-sm text-ink-60 mt-1">
          カテゴリごとに年間予算を設定。月按分は自動で算出され、選択月時点の消化ペースを判定します。
        </p>
      </div>
      {onSave && (
        <div className="flex items-center gap-2">
          <MonthSwitcher />
          {error && <span className="text-xs text-rose-700">{error}</span>}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !isDirty}
            className="px-3.5 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? '保存中…' : isDirty ? '保存' : '保存済'}
          </button>
        </div>
      )}
    </header>
  );
}

function BudgetEditor({ selectedMonth }: { selectedMonth: string }) {
  const config = useBudgetStore((s) => s.config);
  const setConfig = useBudgetStore((s) => s.setConfig);

  // 候補カテゴリ: budget の annual + 取引データ由来
  const knownCategoriesFromTx = useLiveQuery(() => getDistinctLargeCategoriesApplied(), [], []);
  const breakdown = useLiveQuery(() => getCategoryBreakdown(selectedMonth), [selectedMonth], []);
  const ytdBreakdown = useLiveQuery(
    () => getCategoryBreakdownYTD(selectedMonth),
    [selectedMonth],
    [],
  );
  const ytdSummary = useLiveQuery(() => getYearToDateSummary(selectedMonth), [selectedMonth], null);

  const expenseByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of breakdown) m.set(c.name, c.amount);
    return m;
  }, [breakdown]);

  const ytdByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of ytdBreakdown) m.set(c.name, c.amount);
    return m;
  }, [ytdBreakdown]);

  const categoryKeys = useMemo(() => {
    if (!config) return [];
    const all = new Set<string>([...Object.keys(config.budgets.annual), ...knownCategoriesFromTx]);
    return orderCategories(config, all);
  }, [config, knownCategoriesFromTx]);

  if (!config) return null;

  const year = getYear(selectedMonth);
  const yearlyBudget = getAnnualTotalBudget(config);
  const ytdSpent = ytdSummary?.expense ?? 0;
  const ytdPct = yearlyBudget > 0 ? (ytdSpent / yearlyBudget) * 100 : 0;
  const expectedPct = getExpectedPaceAtMonth(selectedMonth);
  const totalPace = yearlyBudget > 0 ? judgePace(ytdPct, expectedPct) : null;

  function setAnnual(category: string, value: number | null) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      if (value === null || value === 0) {
        delete next.budgets.annual[category];
      } else {
        next.budgets.annual[category] = value;
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* 全体サマリ（年間ベース） */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-semibold tracking-wider text-ink-70">{year}年全体</h2>
          <div className="text-xs text-ink-60 tabular-nums">
            今年累計 {formatYen(ytdSpent)} / 年間予算{' '}
            {yearlyBudget > 0 ? formatYen(yearlyBudget) : '—'}
            {yearlyBudget > 0 && (
              <span className={cn('ml-2 font-medium', ytdPct > 100 ? 'text-rose-700' : 'text-ink')}>
                {formatPct(ytdPct)}
              </span>
            )}
          </div>
        </div>
        <ProgressBar pct={ytdPct} />
        {totalPace && (
          <div className="mt-2 flex items-center gap-2 text-[11px] tabular-nums">
            <PaceBadge tone={totalPace.tone}>{totalPace.label}</PaceBadge>
            <span className="text-ink-40">
              実績 {formatPct(ytdPct)} ／ 期待 {formatPct(expectedPct)}（
              {totalPace.diff >= 0 ? '+' : ''}
              {formatPct(totalPace.diff)}）
            </span>
          </div>
        )}
      </section>

      {/* カテゴリ別編集 */}
      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-wider text-ink-40 text-left border-b border-line">
            <tr>
              <th className="py-2 px-4 w-1/4">カテゴリ</th>
              <th className="py-2 px-4 text-right tabular-nums w-[140px]">今月支出</th>
              <th className="py-2 px-4 w-[160px]">年間予算</th>
              <th className="py-2 px-4 text-right tabular-nums w-[120px]">月按分</th>
              <th className="py-2 px-4 w-[200px]">年間消化</th>
            </tr>
          </thead>
          <tbody>
            {categoryKeys.map((cat) => (
              <CategoryRow
                key={cat}
                category={cat}
                spent={expenseByCategory.get(cat) ?? 0}
                annual={getAnnualBudget(config, cat)}
                ytdSpent={ytdByCategory.get(cat) ?? 0}
                expectedPct={expectedPct}
                onSetAnnual={(v) => setAnnual(cat, v)}
              />
            ))}
            {categoryKeys.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 px-4 text-center text-sm text-ink-60">
                  まだカテゴリがありません。同期するとMFのCSVから自動的に拾われます。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-ink-40 leading-relaxed">
        年間予算を入れると 1/12
        の月按分が自動算出され、各月の支出が年間予算に対して何%かが表示されます。 空欄 = 予算なし。
      </p>
    </div>
  );
}

function CategoryRow({
  category,
  spent,
  annual,
  ytdSpent,
  expectedPct,
  onSetAnnual,
}: {
  category: string;
  spent: number;
  annual: number;
  ytdSpent: number;
  expectedPct: number;
  onSetAnnual: (v: number | null) => void;
}) {
  const ytdPct = annual > 0 ? (ytdSpent / annual) * 100 : 0;
  const monthlyAllocated = annual / 12;
  // 今月の支出が年間予算の何 % か（参考表示）
  const monthlyPctOfAnnual = annual > 0 ? (spent / annual) * 100 : 0;
  const pace = annual > 0 ? judgePace(ytdPct, expectedPct) : null;
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2 px-4">
        <span
          className="text-[11px] px-1.5 py-0.5 rounded-sm"
          style={{
            color: colorForCategory(category),
            background: `${colorForCategory(category)}15`,
          }}
        >
          {category}
        </span>
      </td>
      <td className="py-2 px-4 text-right tabular-nums">
        {formatYen(spent)}
        {annual > 0 && (
          <span className="block text-[10px] text-ink-40">
            年間の {formatPct(monthlyPctOfAnnual, 1)}
          </span>
        )}
      </td>
      <td className="py-2 px-4">
        <BudgetInput value={annual > 0 ? annual : null} onChange={onSetAnnual} />
      </td>
      <td className="py-2 px-4 text-right tabular-nums text-ink-60">
        {annual > 0 ? `${formatYen(Math.round(monthlyAllocated))}/月` : '—'}
      </td>
      <td className="py-2 px-4">
        {annual > 0 && pace ? (
          <div className="space-y-1">
            <ProgressBar pct={ytdPct} compact />
            <div className="flex items-center gap-1.5 flex-wrap text-[10px] tabular-nums">
              <PaceBadge tone={pace.tone}>{pace.label}</PaceBadge>
              <span className="text-ink-60">
                {formatPct(ytdPct)}
                <span className="text-ink-40"> / 期待 {formatPct(expectedPct)}</span>
              </span>
            </div>
            <div className="text-[10px] text-ink-40 tabular-nums">
              累計 {formatYen(ytdSpent)} / {formatYen(annual)}
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-ink-40">予算なし</span>
        )}
      </td>
    </tr>
  );
}

function BudgetInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  const display = value === null ? '' : String(value);
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-40 pointer-events-none">
        ¥
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === '') onChange(null);
          else {
            const n = Number(v);
            if (Number.isFinite(n) && n >= 0) onChange(n);
          }
        }}
        placeholder={placeholder ?? '—'}
        className={cn(
          'w-full pl-5 pr-2 py-1 text-xs border border-line rounded-md tabular-nums focus:outline-none focus:border-accent',
        )}
      />
    </div>
  );
}
