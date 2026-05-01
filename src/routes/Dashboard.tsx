import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from 'dayjs';
import FolderPickerButton from '@/components/FolderPickerButton';
import MonthSwitcher from '@/components/MonthSwitcher';
import ProgressBar from '@/components/ProgressBar';
import TrendBarChart from '@/components/charts/TrendBarChart';
import CategoryDonut from '@/components/charts/CategoryDonut';
import { useAuthStore } from '@/store/auth';
import { useBudgetStore } from '@/store/budget';
import { useFolderStore } from '@/store/folder';
import { useSyncStore } from '@/store/sync';
import { useUiStore } from '@/store/ui';
import { db } from '@/lib/db';
import { syncDriveFolder } from '@/lib/sync';
import {
  getCategoryBreakdown,
  getCategoryBreakdownYTD,
  getMonthSummary,
  getMonthlyTrend,
  getRecentTransactionsForMonth,
  getYear,
  getYearToDateSummary,
  shiftMonth,
} from '@/lib/aggregate';
import { getYearlyCategoryBudget, getYearlyTotalBudget, orderCategories } from '@/lib/budget';
import { colorForCategory } from '@/lib/categories';
import { getAssetDelta, getAssetSnapshotOrLatestBefore } from '@/lib/assets';
import { computeMonthlyBalances, type MonthlyBalance } from '@/lib/accountBalance';
import { cn, formatYen, formatPct } from '@/lib/utils';

export default function Dashboard() {
  const folder = useFolderStore((s) => s.folder);
  const selectedMonth = useUiStore((s) => s.selectedMonth);
  useAutoSyncOnFirstFolder();

  return (
    <div className="space-y-5">
      <DashboardHeader folderId={folder?.id ?? null} selectedMonth={selectedMonth} />

      {!folder ? <FolderEmpty /> : <DashboardBody selectedMonth={selectedMonth} />}
    </div>
  );
}

function useAutoSyncOnFirstFolder() {
  const folder = useFolderStore((s) => s.folder);
  const accessToken = useAuthStore((s) => s.accessToken);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);
  const { beginSync, finishSync, failSync } = useSyncStore();

  useEffect(() => {
    if (!folder || !accessToken) return;
    let cancelled = false;
    void (async () => {
      const fileCount = await db.files.count();
      if (cancelled || fileCount > 0) return;
      beginSync();
      try {
        const token = (await ensureFreshToken()) ?? accessToken;
        if (!token) throw new Error('not authenticated');
        const result = await syncDriveFolder(token, folder.id);
        if (!cancelled) finishSync(result);
      } catch (e) {
        if (!cancelled) failSync(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder?.id, accessToken]);
}

function DashboardHeader({
  folderId,
  selectedMonth,
}: {
  folderId: string | null;
  selectedMonth: string;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);
  const { status, beginSync, finishSync, failSync } = useSyncStore();
  const folderName = useFolderStore((s) => s.folder?.name ?? null);

  async function runSync() {
    if (!folderId) return;
    beginSync();
    try {
      const token = (await ensureFreshToken()) ?? accessToken;
      if (!token) throw new Error('not authenticated');
      const result = await syncDriveFolder(token, folderId);
      finishSync(result);
    } catch (e) {
      failSync(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <header className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[11px] tracking-[0.1em] text-ink-40 mb-1">DASHBOARD</div>
        <h1 className="text-[22px] font-medium leading-tight tracking-[-0.01em]">
          {dayjs(`${selectedMonth}-01`).format('YYYY年 M月')}
        </h1>
        {folderName && <div className="text-[11px] text-ink-40 mt-1.5">{folderName}</div>}
      </div>
      {folderId && (
        <div className="flex items-center gap-2">
          <MonthSwitcher />
          <div className="w-px h-5 bg-line mx-1" />
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={status === 'syncing'}
            className="px-3.5 py-[7px] text-xs font-medium bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {status === 'syncing' ? '同期中…' : '同期'}
          </button>
        </div>
      )}
    </header>
  );
}

function FolderEmpty() {
  return (
    <div className="card p-10 text-center space-y-3">
      <h2 className="text-base font-medium">家計簿フォルダを選択</h2>
      <p className="text-sm text-ink-60 max-w-md mx-auto">
        マネーフォワードの月次CSVが入っているDriveフォルダを選んでください。一度選べば、それ以降は同じフォルダから自動で取り込みます。
      </p>
      <FolderPickerButton className="flex justify-center pt-2" />
    </div>
  );
}

function DashboardBody({ selectedMonth }: { selectedMonth: string }) {
  const totalCount = useLiveQuery(() => db.transactions.count(), [], 0);
  const budgetConfig = useBudgetStore((s) => s.config);

  const summary = useLiveQuery(() => getMonthSummary(selectedMonth), [selectedMonth], null);
  const prevSummary = useLiveQuery(
    () => getMonthSummary(shiftMonth(selectedMonth, -1)),
    [selectedMonth],
    null,
  );
  const ytdSummary = useLiveQuery(() => getYearToDateSummary(selectedMonth), [selectedMonth], null);
  const trend = useLiveQuery(() => getMonthlyTrend(selectedMonth, 12), [selectedMonth], []);
  const categories = useLiveQuery(() => getCategoryBreakdown(selectedMonth), [selectedMonth], []);
  const recent = useLiveQuery(
    () => getRecentTransactionsForMonth(selectedMonth, 7),
    [selectedMonth],
    [],
  );
  // 該当月にデータが無ければそれ以前の直近月にフォールバック（資産CSVは月末更新が遅れるケース対応）
  const assetSnapshot = useLiveQuery(
    () => getAssetSnapshotOrLatestBefore(selectedMonth),
    [selectedMonth],
    null,
  );
  // 前月比は当月と前月の両方が「正確に存在する」ときだけ意味を持つ
  const assetDelta = useLiveQuery(() => getAssetDelta(selectedMonth), [selectedMonth], null);
  const assetSnapshotIsExact = assetSnapshot ? assetSnapshot.yearMonth === selectedMonth : false;
  const accountAnchors = useBudgetStore((s) => s.config?.accountAnchors);
  const accountBalances = useLiveQuery(
    async () => {
      if (!accountAnchors || accountAnchors.length === 0) return [];
      const series = await Promise.all(
        accountAnchors.map(async (a) => {
          const all = await computeMonthlyBalances(a);
          // 該当月が series に無ければ「それ以前で最新の月」を採用。
          // pattern にマッチする取引が無いケースや、選択月が anchor 月より過去の
          // ケースで series が短くなっても、KPI は表示できるようにする。
          const findOrBefore = (ym: string): MonthlyBalance | undefined => {
            const exact = all.find((s) => s.yearMonth === ym);
            if (exact) return exact;
            const candidates = all.filter((s) => s.yearMonth <= ym);
            return candidates[candidates.length - 1];
          };
          const cur = findOrBefore(selectedMonth);
          const prev = findOrBefore(shiftMonth(selectedMonth, -1));
          const isExact = cur ? cur.yearMonth === selectedMonth : false;
          return { anchor: a, current: cur, prev, isExact };
        }),
      );
      return series;
    },
    [accountAnchors, selectedMonth],
    [],
  );

  const year = getYear(selectedMonth);
  const yearlyBudget = getYearlyTotalBudget(budgetConfig, year);

  if (totalCount === 0) {
    return (
      <div className="card p-10 text-center space-y-3">
        <h2 className="text-base font-medium">まだデータがありません</h2>
        <p className="text-sm text-ink-60">
          右上の「同期」ボタンで Drive のCSVを取り込んでください。
        </p>
      </div>
    );
  }

  const expDelta =
    summary && prevSummary && prevSummary.expense > 0
      ? ((summary.expense - prevSummary.expense) / prevSummary.expense) * 100
      : null;
  const incDelta =
    summary && prevSummary && prevSummary.income > 0
      ? ((summary.income - prevSummary.income) / prevSummary.income) * 100
      : null;
  const savingsRate =
    summary && summary.income > 0 ? (summary.balance / summary.income) * 100 : null;

  const totalAssetDeltaPct =
    assetSnapshot && assetDelta && assetSnapshot.total - assetDelta.total > 0
      ? (assetDelta.total / (assetSnapshot.total - assetDelta.total)) * 100
      : null;

  return (
    <div className="space-y-4">
      {/* 資産 KPI（資産フォルダ + 口座アンカー設定時のみ） */}
      {(assetSnapshot || accountBalances.some((b) => b.current)) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {assetSnapshot && (
            <KpiCard
              label="総資産"
              value={assetSnapshot.total}
              sub={
                assetSnapshotIsExact && assetDelta
                  ? `前月比 ${assetDelta.total >= 0 ? '+' : '−'}${formatYen(Math.abs(assetDelta.total))}`
                  : `${assetSnapshot.date.replaceAll('-', '/')} 時点`
              }
              delta={assetSnapshotIsExact ? totalAssetDeltaPct : null}
            />
          )}
          {accountBalances.map((b) => {
            if (!b.current) return null;
            // 当月・前月とも正確な月のデータがあるときだけ「前月比」を出す
            const exactPrev =
              b.prev !== undefined && b.prev.yearMonth === shiftMonth(selectedMonth, -1);
            const delta = b.isExact && exactPrev ? b.current.balance - b.prev!.balance : null;
            const deltaPct =
              delta !== null && b.prev!.balance !== 0 ? (delta / b.prev!.balance) * 100 : null;
            return (
              <KpiCard
                key={b.anchor.id}
                label={`${b.anchor.label}（推定）`}
                value={b.current.balance}
                sub={
                  delta !== null
                    ? `前月比 ${delta >= 0 ? '+' : '−'}${formatYen(Math.abs(delta))}`
                    : b.isExact
                      ? `基準日 ${b.anchor.asOfDate.replaceAll('-', '/')}`
                      : `${b.current.yearMonth} 末時点`
                }
                delta={deltaPct}
              />
            );
          })}
        </div>
      )}

      {/* KPI 行 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="収入"
          value={summary?.income ?? 0}
          sub="今月計"
          delta={incDelta}
          deltaInverted={true}
        />
        <KpiCard
          label="支出"
          value={summary?.expense ?? 0}
          sub={
            yearlyBudget > 0 && ytdSummary
              ? `今年累計 ${formatYen(ytdSummary.expense)} / 年間 ${formatYen(yearlyBudget)}`
              : prevSummary
                ? `前月 ${formatYen(prevSummary.expense)}`
                : '—'
          }
          delta={expDelta}
          progress={
            yearlyBudget > 0 && ytdSummary
              ? { current: ytdSummary.expense, max: yearlyBudget }
              : undefined
          }
        />
        <KpiCard
          label="収支"
          value={summary?.balance ?? 0}
          sub={summary && summary.balance >= 0 ? '黒字' : '赤字'}
          accent={summary != null && summary.balance >= 0}
          signed
        />
        <KpiCard
          label="貯蓄率"
          value={0}
          customDisplay={savingsRate !== null ? formatPct(savingsRate) : '—'}
          sub={
            savingsRate !== null && savingsRate >= 20
              ? '健全'
              : savingsRate !== null && savingsRate >= 0
                ? '余剰あり'
                : '赤字'
          }
          accent={savingsRate !== null && savingsRate >= 0}
        />
      </div>

      {/* 中段: トレンド + ドーナツ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        <section className="card p-5">
          <CardHead label="収支推移 · 直近12ヶ月">
            <Legend
              items={[
                { color: '#3F5A4A', label: '収入' },
                { color: 'rgba(26,26,26,0.18)', label: '支出' },
              ]}
            />
          </CardHead>
          <TrendBarChart data={trend} selectedMonth={selectedMonth} height={180} />
        </section>
        <section className="card p-5">
          <CardHead label="カテゴリ別支出" />
          <div className="flex items-center gap-5">
            <CategoryDonut
              data={categories.slice(0, 6)}
              total={summary?.expense ?? 0}
              size={150}
              thickness={18}
            />
            <div className="flex-1 space-y-1.5 min-w-0">
              {categories.length === 0 ? (
                <p className="text-xs text-ink-60">支出データがありません</p>
              ) : (
                categories.slice(0, 6).map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="w-1.5 h-1.5 rounded-sm shrink-0"
                      style={{ background: colorForCategory(c.name) }}
                    />
                    <span className="flex-1 truncate text-ink-70">{c.name}</span>
                    <span className="font-medium tabular-nums">{formatYen(c.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 下段: 予算消化 + 最近の取引 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        <BudgetUsageCard selectedMonth={selectedMonth} />
        <RecentTransactionsCard rows={recent} />
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  sub: string;
  delta?: number | null;
  deltaInverted?: boolean;
  accent?: boolean;
  signed?: boolean;
  numeric?: boolean;
  customDisplay?: string;
  progress?: { current: number; max: number };
}

function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaInverted,
  accent,
  signed,
  numeric,
  customDisplay,
  progress,
}: KpiCardProps) {
  let deltaColor = 'text-ink-60';
  let deltaSign = '';
  if (delta !== null && delta !== undefined) {
    const positive = delta > 0;
    const isBad = deltaInverted ? !positive : positive;
    deltaColor = isBad ? 'text-rose-700' : 'text-accent';
    deltaSign = positive ? '+' : '';
  }
  const display =
    customDisplay !== undefined
      ? customDisplay
      : numeric
        ? value.toLocaleString('ja-JP')
        : signed
          ? (value >= 0 ? '+' : '−') + formatYen(Math.abs(value)).replace(/^¥/, '¥')
          : formatYen(value);

  const pct = progress && progress.max > 0 ? (progress.current / progress.max) * 100 : null;
  const remaining = progress ? Math.max(0, progress.max - progress.current) : 0;
  const overage = progress && progress.current > progress.max ? progress.current - progress.max : 0;

  return (
    <div className="card p-5">
      <div className="text-[10px] tracking-[0.08em] text-ink-60 mb-3 font-medium">
        {label.toUpperCase()}
      </div>
      <div
        className={cn(
          'text-[26px] font-medium tabular-nums leading-tight tracking-[-0.01em] mb-1',
          accent && 'text-accent',
        )}
      >
        {display}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-ink-40">
        <span>{sub}</span>
        {delta !== null && delta !== undefined && (
          <span className={cn('font-medium', deltaColor)}>
            {deltaSign}
            {formatPct(delta)}
          </span>
        )}
      </div>
      {pct !== null && (
        <div className="mt-3 space-y-1">
          <ProgressBar pct={pct} compact />
          <div className="text-[10px] text-ink-60 tabular-nums">
            {overage > 0 ? (
              <span className="text-rose-700 font-medium">
                {formatPct(pct)} · 超過 {formatYen(overage)}
              </span>
            ) : (
              <>
                {formatPct(pct)} 消化 · 残 {formatYen(remaining)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardHead({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline mb-4">
      <div className="text-[11px] tracking-[0.08em] text-ink-60 font-medium">{label}</div>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex gap-3 text-[10px] text-ink-40">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function BudgetUsageCard({ selectedMonth }: { selectedMonth: string }) {
  const config = useBudgetStore((s) => s.config);
  const ytdBreakdown = useLiveQuery(
    () => getCategoryBreakdownYTD(selectedMonth),
    [selectedMonth],
    [],
  );
  const year = getYear(selectedMonth);

  // 予算が設定されているカテゴリ + 使用額があるカテゴリを order に従って表示
  const rows = (() => {
    if (!config) return [];
    const expByCat = new Map(ytdBreakdown.map((b) => [b.name, b.amount]));
    const allCats = new Set<string>([
      ...Object.keys(config.budgets.default),
      ...ytdBreakdown.map((b) => b.name),
    ]);
    // その年のいずれかの月で monthly 上書きがあるカテゴリも候補に
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      for (const k of Object.keys(config.budgets.monthly[ym] ?? {})) allCats.add(k);
    }
    const ordered = orderCategories(config, allCats);
    return ordered
      .map((name) => ({
        name,
        spent: expByCat.get(name) ?? 0,
        budget: getYearlyCategoryBudget(config, year, name),
      }))
      .filter((r) => r.budget > 0 || r.spent > 0)
      .slice(0, 6);
  })();

  return (
    <section className="card p-5">
      <CardHead label={`予算消化 · 今年累計`} />
      {rows.length === 0 ? (
        <p className="text-xs text-ink-60">
          予算がまだ設定されていません。
          <br />
          「予算」ページで設定してください。
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const p = r.budget > 0 ? (r.spent / r.budget) * 100 : 0;
            const over = p > 100;
            return (
              <div key={r.name}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span>{r.name}</span>
                  <span
                    className={cn(
                      'tabular-nums',
                      over ? 'text-rose-700 font-medium' : 'text-ink-60',
                    )}
                  >
                    {formatYen(r.spent)} / {r.budget > 0 ? formatYen(r.budget) : '—'}
                  </span>
                </div>
                <ProgressBar pct={p} compact />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RecentTransactionsCard({
  rows,
}: {
  rows: Array<{
    id: string;
    date: string;
    contentName: string;
    amount: number;
    largeCategory: string;
    account: string;
  }>;
}) {
  return (
    <section className="card p-5">
      <CardHead label="最近の取引" />
      {rows.length === 0 ? (
        <p className="text-xs text-ink-60">この月の取引はありません</p>
      ) : (
        <div className="space-y-0">
          {rows.map((t, i) => {
            const isIncome = t.amount >= 0;
            const cat = t.largeCategory || '未分類';
            const color = colorForCategory(cat);
            return (
              <div
                key={t.id}
                className={cn(
                  'grid grid-cols-[40px_1fr_auto_auto] gap-2.5 py-[7px] items-center text-[11px] tabular-nums',
                  i < rows.length - 1 && 'border-b border-line',
                )}
              >
                <span className="text-ink-40">{dayjs(t.date).format('M/D')}</span>
                <span className="truncate">{t.contentName}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-sm flex items-center gap-1"
                  style={
                    isIncome
                      ? { background: 'rgba(0,0,0,0.04)', color: 'rgba(26,26,26,0.6)' }
                      : { background: `${color}15`, color }
                  }
                >
                  <span
                    className="w-1.5 h-1.5 rounded-sm"
                    style={{ background: isIncome ? 'rgba(26,26,26,0.4)' : color }}
                  />
                  {isIncome ? '収入' : cat}
                </span>
                <span
                  className={cn(
                    'font-medium min-w-[80px] text-right',
                    isIncome ? 'text-accent' : 'text-ink',
                  )}
                >
                  {isIncome ? '+' : '−'}
                  {formatYen(Math.abs(t.amount))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
