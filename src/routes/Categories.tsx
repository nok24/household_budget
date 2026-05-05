import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import MonthSwitcher from '@/components/MonthSwitcher';
import CategoryDonut from '@/components/charts/CategoryDonut';
import Sparkline from '@/components/charts/Sparkline';
import { useBudgetStore } from '@/store/budget';
import { useUiStore } from '@/store/ui';
import {
  breakdownCategories,
  breakdownCategoriesYTD,
  categoryMonthlyTrend,
  dayOfWeekAverageForCategory,
  storeTopForCategory,
  summarizeMonth,
  type DbTransaction,
} from '@/lib/aggregate';
import { useAppliedTransactions } from '@/lib/queries';
import { getAnnualBudget, getExpectedPaceAtMonth, judgePace } from '@/lib/budget';
import PaceBadge from '@/components/PaceBadge';
import { colorForCategory } from '@/lib/categories';
import { cn, formatYen, formatPct } from '@/lib/utils';

export default function Categories() {
  const selectedMonth = useUiStore((s) => s.selectedMonth);
  const { data: applied } = useAppliedTransactions();
  const breakdown = useMemo(
    () => breakdownCategories(applied, selectedMonth),
    [applied, selectedMonth],
  );
  const summary = useMemo(() => summarizeMonth(applied, selectedMonth), [applied, selectedMonth]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const activeCategory = selectedCategory ?? breakdown[0]?.name ?? null;

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.1em] text-ink-40 mb-1">CATEGORIES</div>
          <h1 className="text-[22px] font-medium leading-tight">
            {dayjs(`${selectedMonth}-01`).format('YYYY年 M月')} のカテゴリ別レポート
          </h1>
        </div>
        <MonthSwitcher />
      </header>

      {/* 上段: 大ドーナツ + 推移テーブル */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        <DonutCard breakdown={breakdown} totalExpense={summary.expense} />
        <CategoryTable
          breakdown={breakdown}
          totalExpense={summary.expense}
          activeCategory={activeCategory}
          onSelect={setSelectedCategory}
          selectedMonth={selectedMonth}
          applied={applied}
        />
      </div>

      {/* 下段: カテゴリ詳細 */}
      {activeCategory && (
        <CategoryDetail
          category={activeCategory}
          totalExpense={summary.expense}
          selectedMonth={selectedMonth}
          breakdown={breakdown}
          applied={applied}
        />
      )}
    </div>
  );
}

function DonutCard({
  breakdown,
  totalExpense,
}: {
  breakdown: { name: string; amount: number; count: number }[];
  totalExpense: number;
}) {
  const top = breakdown[0];
  const topPct = top && totalExpense > 0 ? (top.amount / totalExpense) * 100 : 0;

  return (
    <section className="card p-6 flex flex-col items-center">
      <div className="text-[11px] tracking-[0.1em] text-ink-40 self-start mb-4 font-medium">
        支出構成
      </div>
      <CategoryDonut data={breakdown} total={totalExpense} size={220} thickness={26} />
      {top && (
        <div className="mt-3.5 text-[11px] text-ink-60 text-center">
          最大カテゴリ:{' '}
          <span className="text-ink font-medium">
            {top.name} ({formatPct(topPct, 0)})
          </span>
        </div>
      )}
    </section>
  );
}

function CategoryTable({
  breakdown,
  totalExpense,
  activeCategory,
  onSelect,
  selectedMonth,
  applied,
}: {
  breakdown: { name: string; amount: number; count: number }[];
  totalExpense: number;
  activeCategory: string | null;
  onSelect: (c: string) => void;
  selectedMonth: string;
  applied: DbTransaction[];
}) {
  const config = useBudgetStore((s) => s.config);
  const ytdBreakdown = useMemo(
    () => breakdownCategoriesYTD(applied, selectedMonth),
    [applied, selectedMonth],
  );
  const ytdByCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of ytdBreakdown) m.set(c.name, c.amount);
    return m;
  }, [ytdBreakdown]);

  return (
    <section className="card p-6">
      <div className="text-[11px] tracking-[0.1em] text-ink-40 mb-4 font-medium">
        カテゴリ別 · 推移と年間予算
      </div>
      <div className="grid grid-cols-[24px_140px_60px_1fr_90px_70px] gap-2.5 text-[10px] tracking-[0.06em] text-ink-40 pb-2 border-b border-line">
        <span />
        <span>カテゴリ</span>
        <span className="text-right">占有率</span>
        <span>12ヶ月推移</span>
        <span className="text-right">今月支出</span>
        <span className="text-right">年間消化</span>
      </div>
      {breakdown.length === 0 ? (
        <div className="py-8 text-center text-sm text-ink-60">支出データがありません</div>
      ) : (
        breakdown
          .slice(0, 8)
          .map((c) => (
            <CategoryRow
              key={c.name}
              category={c.name}
              amount={c.amount}
              totalExpense={totalExpense}
              ytdAmount={ytdByCategory.get(c.name) ?? 0}
              yearlyBudget={getAnnualBudget(config, c.name)}
              isActive={c.name === activeCategory}
              onClick={() => onSelect(c.name)}
              selectedMonth={selectedMonth}
              applied={applied}
            />
          ))
      )}
    </section>
  );
}

function CategoryRow({
  category,
  amount,
  totalExpense,
  ytdAmount,
  yearlyBudget,
  isActive,
  onClick,
  selectedMonth,
  applied,
}: {
  category: string;
  amount: number;
  totalExpense: number;
  ytdAmount: number;
  yearlyBudget: number;
  isActive: boolean;
  onClick: () => void;
  selectedMonth: string;
  applied: DbTransaction[];
}) {
  const trend = useMemo(
    () => categoryMonthlyTrend(applied, category, selectedMonth, 12),
    [applied, category, selectedMonth],
  );
  const sparkData = trend.map((t) => t.amount);
  const occupancy = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
  const budgetPct = yearlyBudget > 0 ? (ytdAmount / yearlyBudget) * 100 : 0;
  const expectedPct = getExpectedPaceAtMonth(selectedMonth);
  const pace = yearlyBudget > 0 ? judgePace(budgetPct, expectedPct) : null;
  const color = colorForCategory(category);

  let budgetColor = 'text-accent';
  if (budgetPct > 100) budgetColor = 'text-rose-700';
  else if (budgetPct > 90) budgetColor = 'text-amber-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left grid grid-cols-[24px_140px_60px_1fr_90px_70px] gap-2.5 items-center py-3 border-b border-line last:border-0 text-[12px] hover:bg-canvas transition-colors',
        isActive && 'bg-accent/[0.04]',
      )}
    >
      <span
        className="w-[18px] h-[18px] rounded-[3px] grid place-items-center text-white text-[10px] font-medium"
        style={{ background: color, opacity: 0.85 }}
      >
        {category.charAt(0)}
      </span>
      <span className="truncate">{category}</span>
      <span className="text-right tabular-nums text-ink-60">{formatPct(occupancy, 0)}</span>
      <Sparkline
        data={sparkData.length > 0 ? sparkData : [0, 0]}
        width={180}
        height={28}
        accent={color}
      />
      <span className="text-right tabular-nums font-medium">{formatYen(amount)}</span>
      <span
        className="text-right tabular-nums text-[11px] flex flex-col items-end gap-0.5"
        title={
          yearlyBudget > 0
            ? `今年累計 ${formatYen(ytdAmount)} / 年間予算 ${formatYen(yearlyBudget)} · 期待 ${formatPct(expectedPct)}`
            : undefined
        }
      >
        {yearlyBudget > 0 ? (
          <>
            <span className={cn('font-medium', budgetColor)}>{formatPct(budgetPct, 0)}</span>
            {pace && (
              <PaceBadge tone={pace.tone} compact>
                {pace.label}
              </PaceBadge>
            )}
          </>
        ) : (
          <span className="text-ink-40">—</span>
        )}
      </span>
    </button>
  );
}

function CategoryDetail({
  category,
  totalExpense,
  selectedMonth,
  breakdown,
  applied,
}: {
  category: string;
  totalExpense: number;
  selectedMonth: string;
  breakdown: { name: string; amount: number; count: number }[];
  applied: DbTransaction[];
}) {
  const stores = useMemo(
    () => storeTopForCategory(applied, selectedMonth, category, 5),
    [applied, selectedMonth, category],
  );
  const dowAverage = useMemo(
    () => dayOfWeekAverageForCategory(applied, selectedMonth, category),
    [applied, selectedMonth, category],
  );
  const trend = useMemo(
    () => categoryMonthlyTrend(applied, category, selectedMonth, 12),
    [applied, category, selectedMonth],
  );

  const catAmount = useMemo(
    () => breakdown.find((b) => b.name === category)?.amount ?? 0,
    [breakdown, category],
  );
  const catPct = totalExpense > 0 ? (catAmount / totalExpense) * 100 : 0;

  // 前月比
  const thisIdx = trend.length - 1;
  const prevIdx = trend.length - 2;
  const thisAmt = thisIdx >= 0 ? (trend[thisIdx]?.amount ?? 0) : 0;
  const prevAmt = prevIdx >= 0 ? (trend[prevIdx]?.amount ?? 0) : 0;
  const delta = thisAmt - prevAmt;
  const deltaPct = prevAmt > 0 ? (delta / prevAmt) * 100 : null;

  // 平均・標準偏差
  const stats = useMemo(() => {
    const vals = trend.map((t) => t.amount).filter((v) => v > 0);
    if (vals.length === 0) return { avg: 0, std: 0 };
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length;
    return { avg, std: Math.sqrt(variance) };
  }, [trend]);

  const dowMax = Math.max(...dowAverage.map((d) => d.average), 1);

  return (
    <section className="card p-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[11px] tracking-[0.1em] text-ink-40 font-medium">
            CATEGORY DETAIL
          </div>
          <div className="text-lg font-medium mt-1">
            {category}{' '}
            <span className="text-xs text-ink-40 ml-2 font-normal tabular-nums">
              {formatYen(catAmount)} · {formatPct(catPct, 1)}
            </span>
          </div>
        </div>
        {deltaPct !== null && (
          <div className="text-[11px] text-ink-60">
            前月比{' '}
            <span
              className={cn(
                'font-medium ml-1',
                delta < 0 ? 'text-accent' : delta > 0 ? 'text-rose-700' : '',
              )}
            >
              {delta > 0 ? '+' : '−'}
              {formatYen(Math.abs(delta))} ({delta > 0 ? '+' : '−'}
              {formatPct(Math.abs(deltaPct))})
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 店舗別 TOP */}
        <div>
          <div className="text-[10px] tracking-[0.1em] text-ink-40 mb-2.5">店舗別 TOP</div>
          {stores.length === 0 ? (
            <p className="text-xs text-ink-60">データなし</p>
          ) : (
            stores.map((s) => (
              <div
                key={s.name}
                className="grid grid-cols-[1fr_auto_auto] gap-2.5 py-1.5 text-[11px] items-baseline border-b border-line last:border-0"
              >
                <span className="truncate">{s.name}</span>
                <span className="text-ink-40 text-[10px]">{s.count}件</span>
                <span className="font-medium tabular-nums min-w-[60px] text-right">
                  {formatYen(s.amount)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* 曜日別 平均支出 */}
        <div>
          <div className="text-[10px] tracking-[0.1em] text-ink-40 mb-2.5">曜日別 平均支出</div>
          <div className="flex items-end gap-1.5 h-[120px] pb-[18px] relative">
            {dowAverage.map((d) => (
              <div key={d.dow} className="flex-1 relative h-full flex flex-col justify-end">
                <div
                  className="bg-accent rounded-t-[2px] opacity-85"
                  style={{ height: `${(d.average / dowMax) * 100}%` }}
                  title={`${d.label}: ${formatYen(d.average)}`}
                />
                <div className="absolute -bottom-4 left-0 right-0 text-center text-[10px] text-ink-40">
                  {d.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] text-ink-60">
            {(() => {
              const max = dowAverage.reduce(
                (m, d) => (d.average > m.average ? d : m),
                dowAverage[0] ?? { dow: 0, label: '—', average: 0 },
              );
              if (!max || max.average === 0) return 'データが不足しています';
              return `${max.label}曜日が最も多い (${formatYen(max.average)} / 平均)`;
            })()}
          </div>
        </div>

        {/* 12ヶ月の推移 */}
        <div>
          <div className="text-[10px] tracking-[0.1em] text-ink-40 mb-2.5">12ヶ月の推移</div>
          <Sparkline
            data={trend.length > 0 ? trend.map((t) => t.amount) : [0, 0]}
            width={260}
            height={70}
            accent={colorForCategory(category)}
          />
          <div className="flex justify-between text-[10px] text-ink-40 mt-2 tabular-nums">
            <span>{trend[0]?.yearMonth ?? '—'}</span>
            <span>{trend[trend.length - 1]?.yearMonth ?? selectedMonth}</span>
          </div>
          <div className="mt-3 text-[11px] text-ink-60 tabular-nums">
            平均 <span className="text-ink font-medium">{formatYen(Math.round(stats.avg))}</span> ·
            標準偏差 ±{formatYen(Math.round(stats.std))}
          </div>
        </div>
      </div>
    </section>
  );
}
