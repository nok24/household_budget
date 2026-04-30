import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import dayjs from 'dayjs';
import EditTransactionModal from '@/components/EditTransactionModal';
import { useBudgetStore } from '@/store/budget';
import { db, type DbTransaction } from '@/lib/db';
import { getAllTransactionsApplied } from '@/lib/aggregate';
import { colorForCategory } from '@/lib/categories';
import { findMember, inferMemberId, UNASSIGNED_MEMBER_ID } from '@/lib/members';
import { cn, formatYen } from '@/lib/utils';

type SortKey = 'date' | 'amount';
type SortDir = 'asc' | 'desc';
type SignFilter = 'all' | 'expense' | 'income';

interface Filters {
  yearMonth: string;
  signFilter: SignFilter;
  memberId: string; // '' = すべて、'_unassigned' = 未割当
  search: string;
  hideTransfers: boolean;
  hideNonTarget: boolean;
}

const DEFAULT_FILTERS: Filters = {
  yearMonth: '',
  signFilter: 'all',
  memberId: '',
  search: '',
  hideTransfers: true,
  hideNonTarget: true,
};

const DAY_OF_WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export default function Transactions() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editTarget, setEditTarget] = useState<{
    applied: DbTransaction;
    raw: DbTransaction;
  } | null>(null);

  const budgetConfig = useBudgetStore((s) => s.config);
  const allApplied = useLiveQuery(() => getAllTransactionsApplied(), [], []);
  const allRaw = useLiveQuery(() => db.transactions.toArray(), [], []);
  const months = useLiveQuery(
    async () => {
      const set = new Set<string>();
      await db.transactions.each((t) => {
        if (t.yearMonth) set.add(t.yearMonth);
      });
      return [...set].sort().reverse();
    },
    [],
    [],
  );

  const rawById = useMemo(() => {
    const m = new Map<string, DbTransaction>();
    for (const r of allRaw) m.set(r.id, r);
    return m;
  }, [allRaw]);

  // フィルタ適用
  const filteredRows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allApplied.filter((t) => {
      if (filters.yearMonth && t.yearMonth !== filters.yearMonth) return false;
      if (filters.signFilter === 'expense' && t.amount >= 0) return false;
      if (filters.signFilter === 'income' && t.amount < 0) return false;
      if (filters.memberId) {
        const inferred = inferMemberId(t.account, budgetConfig);
        const memberKey = inferred ?? UNASSIGNED_MEMBER_ID;
        if (memberKey !== filters.memberId) return false;
      }
      if (filters.hideTransfers && t.isTransfer) return false;
      if (filters.hideNonTarget && !t.isTarget) return false;
      if (q) {
        const hay = `${t.contentName} ${t.account} ${t.memo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allApplied, filters, budgetConfig]);

  // ソート
  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      if (sortKey === 'date') {
        const cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      } else {
        return sortDir === 'asc' ? a.amount - b.amount : b.amount - a.amount;
      }
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  // 仮想スクロール
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  // 集計（フィルタ後）
  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of sortedRows) {
      if (!t.isTarget || t.isTransfer) continue;
      if (t.amount >= 0) income += t.amount;
      else expense += -t.amount;
    }
    return { income, expense, balance: income - expense, count: sortedRows.length };
  }, [sortedRows]);

  const memberOptions = budgetConfig?.members ?? [];

  return (
    <div className="space-y-4 h-[calc(100vh-3.5rem)] flex flex-col max-md:h-auto">
      <header>
        <div className="text-[11px] tracking-[0.1em] text-ink-40 mb-1">TRANSACTIONS</div>
        <h1 className="text-[22px] font-medium leading-tight">
          取引一覧{' '}
          <span className="text-[13px] text-ink-40 font-normal ml-2">
            {filters.yearMonth || '全期間'} · {sortedRows.length.toLocaleString()}件
            {sortedRows.length !== allApplied.length && (
              <span className="text-ink-40">（全{allApplied.length.toLocaleString()}件中）</span>
            )}
          </span>
        </h1>
      </header>

      {/* フィルタバー */}
      <section className="bg-surface border border-line rounded-card px-3.5 py-3 flex flex-wrap items-center gap-2 text-xs shrink-0">
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder="検索…"
          className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs border border-line rounded bg-canvas focus:outline-none focus:border-accent"
        />
        <select
          value={filters.yearMonth}
          onChange={(e) => setFilters({ ...filters, yearMonth: e.target.value })}
          className="px-2 py-1.5 text-xs border border-line rounded bg-white focus:outline-none focus:border-accent"
        >
          <option value="">全期間</option>
          {months.map((ym) => (
            <option key={ym} value={ym}>
              {ym}
            </option>
          ))}
        </select>

        <SignToggle
          value={filters.signFilter}
          onChange={(v) => setFilters({ ...filters, signFilter: v })}
        />

        <div className="w-px h-[18px] bg-line mx-1" />

        <MemberToggle
          memberId={filters.memberId}
          options={memberOptions}
          onChange={(v) => setFilters({ ...filters, memberId: v })}
        />

        <div className="w-px h-[18px] bg-line mx-1" />

        <label className="flex items-center gap-1.5 cursor-pointer select-none text-ink-60">
          <input
            type="checkbox"
            checked={filters.hideTransfers}
            onChange={(e) => setFilters({ ...filters, hideTransfers: e.target.checked })}
            className="accent-accent"
          />
          振替を非表示
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none text-ink-60">
          <input
            type="checkbox"
            checked={filters.hideNonTarget}
            onChange={(e) => setFilters({ ...filters, hideNonTarget: e.target.checked })}
            className="accent-accent"
          />
          計算対象外を非表示
        </label>

        <div className="ml-auto flex items-center gap-3 tabular-nums text-ink-60 text-[11px]">
          <span>
            収入 <span className="font-medium text-ink">{formatYen(summary.income)}</span>
          </span>
          <span>
            支出 <span className="font-medium text-ink">{formatYen(summary.expense)}</span>
          </span>
          <span>
            差引{' '}
            <span
              className={cn('font-medium', summary.balance >= 0 ? 'text-accent' : 'text-rose-700')}
            >
              {summary.balance >= 0 ? '+' : '−'}
              {formatYen(Math.abs(summary.balance))}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-ink-40 hover:text-ink underline-offset-2 hover:underline"
          >
            クリア
          </button>
        </div>
      </section>

      {/* テーブル */}
      <section className="card flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="grid grid-cols-[90px_1fr_140px_120px_80px_130px] gap-3 text-[10px] tracking-[0.08em] text-ink-40 px-[18px] py-3 border-b border-line bg-sidebar font-medium shrink-0">
          <SortHeader
            label="日付"
            active={sortKey === 'date'}
            dir={sortDir}
            onClick={() => toggleSort('date')}
          />
          <div>項目</div>
          <div>カテゴリ</div>
          <div>口座</div>
          <div>担当</div>
          <SortHeader
            label="金額"
            active={sortKey === 'amount'}
            dir={sortDir}
            onClick={() => toggleSort('amount')}
            align="right"
          />
        </div>
        <div ref={parentRef} className="flex-1 overflow-auto">
          {sortedRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-ink-60">
              条件に一致する取引がありません
            </div>
          ) : (
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const t = sortedRows[virtualRow.index];
                const raw = rawById.get(t.id) ?? t;
                const overridden = raw !== t || hasDifferences(raw, t);
                const inferredMemberId = inferMemberId(t.account, budgetConfig);
                const member = findMember(budgetConfig, inferredMemberId);
                const isIncome = t.amount >= 0;
                const cat = t.largeCategory || '未分類';
                const color = colorForCategory(cat);
                const d = dayjs(t.date);
                const dow = DAY_OF_WEEK[d.day()];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEditTarget({ applied: t, raw })}
                    className={cn(
                      'absolute top-0 left-0 w-full text-left grid grid-cols-[90px_1fr_140px_120px_80px_130px] gap-3 items-center px-[18px] text-xs tabular-nums hover:bg-canvas transition-colors',
                      'border-b border-line',
                      !t.isTarget && 'opacity-50',
                    )}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="text-ink-60 whitespace-nowrap">
                      {d.format('M/D')} <span className="text-ink-40 ml-0.5">{dow}</span>
                    </div>
                    <div className="truncate">
                      {t.contentName}
                      {overridden && (
                        <span className="ml-1.5 inline-block text-[9px] tracking-wider text-accent border border-accent/30 px-1 rounded-sm">
                          編集
                        </span>
                      )}
                      {t.isTransfer && (
                        <span className="ml-1.5 inline-block text-[9px] tracking-wider text-ink-40 border border-line px-1 rounded-sm">
                          振替
                        </span>
                      )}
                    </div>
                    <div className="truncate">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-60">
                        <span
                          className="w-1.5 h-1.5 rounded-sm shrink-0"
                          style={{ background: isIncome ? '#3F5A4A' : color }}
                        />
                        {isIncome ? '収入' : cat}
                      </span>
                    </div>
                    <div className="truncate text-ink-60 text-[11px]">{t.account}</div>
                    <div className="justify-self-start">
                      <span
                        className="text-[10px] text-ink-60 px-1.5 py-0.5 rounded-sm"
                        style={{
                          background: `${member.color}18`,
                          color: member.color,
                        }}
                      >
                        {member.name}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'text-right font-medium whitespace-nowrap',
                        isIncome ? 'text-accent' : 'text-ink',
                      )}
                    >
                      {isIncome ? '+' : '−'}
                      {formatYen(Math.abs(t.amount))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {editTarget && (
        <EditTransactionModal
          transaction={editTarget.applied}
          rawTransaction={editTarget.raw}
          open={true}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}

function SignToggle({ value, onChange }: { value: SignFilter; onChange: (v: SignFilter) => void }) {
  const items: { value: SignFilter; label: string }[] = [
    { value: 'all', label: 'すべて' },
    { value: 'expense', label: '支出' },
    { value: 'income', label: '収入' },
  ];
  return (
    <div className="flex">
      {items.map((it, i) => (
        <button
          key={it.value}
          type="button"
          onClick={() => onChange(it.value)}
          className={cn(
            'px-3 py-1.5 text-[11px] border border-line transition-colors',
            i === 0 && 'rounded-l',
            i === items.length - 1 && 'rounded-r',
            i > 0 && '-ml-px',
            value === it.value
              ? 'bg-accent border-accent text-white z-10'
              : 'text-ink-60 hover:bg-canvas',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function MemberToggle({
  memberId,
  options,
  onChange,
}: {
  memberId: string;
  options: { id: string; name: string; color: string }[];
  onChange: (v: string) => void;
}) {
  const all: { id: string; name: string; color?: string }[] = [
    { id: '', name: 'すべて' },
    ...options,
    { id: UNASSIGNED_MEMBER_ID, name: '未割当' },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {all.map((m) => (
        <button
          key={m.id || 'all'}
          type="button"
          onClick={() => onChange(m.id)}
          className={cn(
            'px-2.5 py-1.5 text-[11px] rounded border border-line text-ink-60 hover:bg-canvas transition-colors flex items-center gap-1',
            memberId === m.id && 'bg-accent border-accent text-white hover:bg-accent',
          )}
        >
          {m.color && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: memberId === m.id ? 'rgba(255,255,255,0.7)' : m.color,
              }}
            />
          )}
          {m.name}
        </button>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'right';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 hover:text-ink transition-colors',
        align === 'right' && 'justify-end',
        active && 'text-ink',
      )}
    >
      {label}
      {active && <span className="text-[8px]">{dir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );
}

function hasDifferences(raw: DbTransaction, applied: DbTransaction): boolean {
  return (
    raw.largeCategory !== applied.largeCategory ||
    raw.midCategory !== applied.midCategory ||
    raw.memo !== applied.memo ||
    raw.isTransfer !== applied.isTransfer ||
    raw.isTarget !== applied.isTarget
  );
}
