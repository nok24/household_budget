import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import MonthSwitcher from '@/components/MonthSwitcher';
import ProgressBar from '@/components/ProgressBar';
import { useAuthStore } from '@/store/auth';
import { useBudgetStore } from '@/store/budget';
import { useFolderStore } from '@/store/folder';
import { useUiStore } from '@/store/ui';
import { getMonthBudget, getTotalMonthBudget, orderCategories } from '@/lib/budget';
import {
  getCategoryBreakdown,
  getDistinctLargeCategoriesApplied,
  getMonthSummary,
} from '@/lib/aggregate';
import { colorForCategory } from '@/lib/categories';
import { cn, formatYen, formatPct } from '@/lib/utils';

export default function Budget() {
  const folder = useFolderStore((s) => s.folder);
  const accessToken = useAuthStore((s) => s.accessToken);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);
  const status = useBudgetStore((s) => s.status);
  const config = useBudgetStore((s) => s.config);
  const error = useBudgetStore((s) => s.error);
  const isDirty = useBudgetStore((s) => s.isDirty);
  const hydrate = useBudgetStore((s) => s.hydrate);
  const save = useBudgetStore((s) => s.save);

  const selectedMonth = useUiStore((s) => s.selectedMonth);

  // フォルダがあればロード
  useEffect(() => {
    if (!folder || !accessToken || config) return;
    let cancelled = false;
    void (async () => {
      const token = (await ensureFreshToken()) ?? accessToken;
      if (!token || cancelled) return;
      await hydrate(token, folder.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [folder?.id, accessToken, config, ensureFreshToken, hydrate, folder]);

  async function onSave() {
    const token = (await ensureFreshToken()) ?? accessToken;
    if (!token) return;
    await save(token);
  }

  if (!folder) {
    return (
      <div className="space-y-4">
        <Header selectedMonth={selectedMonth} />
        <div className="card p-8 text-center text-sm text-ink-60">
          先にダッシュボードでDriveフォルダを選択してください。
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
          カテゴリごとに月次予算を設定。空欄は予算なし扱いです。
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

  // 候補カテゴリ: budget の default + monthly + 取引データ由来
  const knownCategoriesFromTx = useLiveQuery(
    () => getDistinctLargeCategoriesApplied(),
    [],
    [],
  );
  const breakdown = useLiveQuery(
    () => getCategoryBreakdown(selectedMonth),
    [selectedMonth],
    [],
  );
  const monthSummary = useLiveQuery(
    () => getMonthSummary(selectedMonth),
    [selectedMonth],
    null,
  );

  const expenseByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of breakdown) m.set(c.name, c.amount);
    return m;
  }, [breakdown]);

  const categoryKeys = useMemo(() => {
    if (!config) return [];
    const all = new Set<string>([
      ...Object.keys(config.budgets.default),
      ...Object.keys(config.budgets.monthly[selectedMonth] ?? {}),
      ...knownCategoriesFromTx,
    ]);
    return orderCategories(config, all);
  }, [config, knownCategoriesFromTx, selectedMonth]);

  if (!config) return null;

  const totalBudget = getTotalMonthBudget(config, selectedMonth);
  const totalSpent = monthSummary?.expense ?? 0;
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  function setBudget(category: string, scope: 'default' | 'monthly', value: number | null) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      if (scope === 'default') {
        if (value === null) {
          delete next.budgets.default[category];
        } else {
          next.budgets.default[category] = value;
        }
      } else {
        const map = { ...(next.budgets.monthly[selectedMonth] ?? {}) };
        if (value === null) {
          delete map[category];
        } else {
          map[category] = value;
        }
        if (Object.keys(map).length === 0) {
          delete next.budgets.monthly[selectedMonth];
        } else {
          next.budgets.monthly[selectedMonth] = map;
        }
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* 全体サマリ */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-semibold tracking-wider text-ink-70">月全体</h2>
          <div className="text-xs text-ink-60 tabular-nums">
            支出 {formatYen(totalSpent)} / 予算{' '}
            {totalBudget > 0 ? formatYen(totalBudget) : '—'}
            {totalBudget > 0 && (
              <span className={cn('ml-2 font-medium', totalPct > 100 ? 'text-rose-700' : 'text-ink')}>
                {formatPct(totalPct)}
              </span>
            )}
          </div>
        </div>
        <ProgressBar pct={totalPct} />
      </section>

      {/* カテゴリ別編集 */}
      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-wider text-ink-40 text-left border-b border-line">
            <tr>
              <th className="py-2 px-4 w-1/3">カテゴリ</th>
              <th className="py-2 px-4 text-right tabular-nums">今月支出</th>
              <th className="py-2 px-4 w-[140px]">毎月予算</th>
              <th className="py-2 px-4 w-[160px]">{dayjs(`${selectedMonth}-01`).format('M月')}のみ上書き</th>
              <th className="py-2 px-4 w-[180px]">進捗</th>
            </tr>
          </thead>
          <tbody>
            {categoryKeys.map((cat) => (
              <CategoryRow
                key={cat}
                category={cat}
                spent={expenseByCategory.get(cat) ?? 0}
                defaultBudget={config.budgets.default[cat]}
                monthOverride={config.budgets.monthly[selectedMonth]?.[cat]}
                effective={getMonthBudget(config, selectedMonth, cat)}
                onSetDefault={(v) => setBudget(cat, 'default', v)}
                onSetMonth={(v) => setBudget(cat, 'monthly', v)}
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
        毎月予算 = 既定値（毎月適用）。 上書き = この月だけ別の金額にする（差分）。
        どちらか一方が入っていれば集計に使われます。両方ある場合は「この月の上書き」が優先。
        空欄＋空欄 = 予算なし。
      </p>
    </div>
  );
}

function CategoryRow({
  category,
  spent,
  defaultBudget,
  monthOverride,
  effective,
  onSetDefault,
  onSetMonth,
}: {
  category: string;
  spent: number;
  defaultBudget: number | string | undefined;
  monthOverride: number | string | undefined;
  effective: number;
  onSetDefault: (v: number | null) => void;
  onSetMonth: (v: number | null) => void;
}) {
  const pct = effective > 0 ? (spent / effective) * 100 : 0;
  return (
    <tr className="border-b border-line/40 last:border-0">
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
      <td className="py-2 px-4 text-right tabular-nums">{formatYen(spent)}</td>
      <td className="py-2 px-4">
        <BudgetInput
          value={typeof defaultBudget === 'number' ? defaultBudget : null}
          onChange={onSetDefault}
        />
      </td>
      <td className="py-2 px-4">
        <BudgetInput
          value={typeof monthOverride === 'number' ? monthOverride : null}
          onChange={onSetMonth}
          placeholder={
            typeof defaultBudget === 'number' ? formatYen(defaultBudget) : '—'
          }
          highlight
        />
      </td>
      <td className="py-2 px-4">
        {effective > 0 ? (
          <div className="space-y-1">
            <ProgressBar pct={pct} compact />
            <div className="text-[10px] text-ink-60 tabular-nums">
              {formatPct(pct)} · 残 {formatYen(Math.max(0, effective - spent))}
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
  highlight,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  highlight?: boolean;
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
          highlight && value !== null && 'border-accent/40 bg-accent/[0.04]',
        )}
      />
    </div>
  );
}

