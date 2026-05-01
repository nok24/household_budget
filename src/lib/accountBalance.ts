import dayjs from 'dayjs';
import { db, type DbTransaction } from './db';
import { applyOverridesToRows } from './overrides';
import { shiftMonth } from './aggregate';
import type { AccountAnchor } from '@/types';

// 機関別残高の推定。MFの資産推移CSVは機関ごとの内訳を含まないため、
// アンカー（asOfDate 時点の残高）から取引データの収支を遡って各月末の
// 残高を再構成する。MF が拾えていない取引（手元現金の支出など）は
// ズレるが、家庭運用で「だいたいの推移を見る」用途なら十分。
//
// 計算式（asOfDate を含む取引はアンカー残高に「既に反映済み」とみなす）:
//   bal(asOf月末) = anchor.balance + Σ(asOfDate より後 〜 月末 の同口座取引)
//   bal(月末 M-1) = bal(月末 M) − Σ(月 M の同口座取引)
//   bal(月末 M+1) = bal(月末 M) + Σ(月 M+1 の同口座取引)

export interface MonthlyBalance {
  yearMonth: string;
  balance: number;
  flow: number; // その月の純増減（参考表示用）
}

function matchesPattern(account: string, pattern: string): boolean {
  if (!pattern) return false;
  return account.includes(pattern);
}

/**
 * 指定パターンにマッチする取引のみを返す。振替も加減算したいので isTransfer / isTarget は無視。
 * 上書き（overrides）の振替フラグも反映するために applyOverridesToRows を通す。
 */
async function loadAccountTransactions(pattern: string): Promise<DbTransaction[]> {
  const all = await db.transactions.toArray();
  const applied = await applyOverridesToRows(all);
  return applied.filter((t) => matchesPattern(t.account, pattern));
}

function sumAmountInRange(
  rows: DbTransaction[],
  startInclusive: string | null,
  endInclusive: string | null,
): number {
  let s = 0;
  for (const t of rows) {
    if (startInclusive && t.date < startInclusive) continue;
    if (endInclusive && t.date > endInclusive) continue;
    s += t.amount;
  }
  return s;
}

function lastDateOfMonth(yearMonth: string): string {
  // YYYY-MM-DD を返す（その月の末日）
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${yearMonth}-${String(d).padStart(2, '0')}`;
}

function listMonthsBetween(start: string, end: string): string[] {
  if (start > end) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return out;
}

/**
 * アンカーから各月の月末残高を計算。範囲は「取引の最古月（or アンカー月）〜現在月」
 * を連続して埋める。取引のない月もエントリを返すので、ダッシュボードで未来月や
 * 取引のない月を選んでも残高が表示される。
 */
export async function computeMonthlyBalances(anchor: AccountAnchor): Promise<MonthlyBalance[]> {
  if (!anchor.pattern || !anchor.asOfDate) return [];
  const rows = await loadAccountTransactions(anchor.pattern);

  // 計算範囲の決定。取引・アンカー月・現在月をすべて内包するように。
  const knownMonths = new Set<string>();
  for (const t of rows) {
    if (t.yearMonth) knownMonths.add(t.yearMonth);
  }
  const anchorMonth = anchor.asOfDate.slice(0, 7);
  knownMonths.add(anchorMonth);
  const currentMonth = dayjs().format('YYYY-MM');
  knownMonths.add(currentMonth);

  const sortedKnown = [...knownMonths].sort();
  const earliest = sortedKnown[0];
  const latest = sortedKnown[sortedKnown.length - 1];
  const months = listMonthsBetween(earliest, latest);

  // アンカー月末の残高を最初に求める:
  //   bal(asOf月末) = anchor.balance + Σ(asOfDate < date ≤ 月末 の取引)
  const asOfMonthEnd = lastDateOfMonth(anchorMonth);
  const startExclusiveDate = anchor.asOfDate;
  const flowAfterAnchorThisMonth = rows.reduce((s, t) => {
    if (t.date <= startExclusiveDate) return s;
    if (t.date > asOfMonthEnd) return s;
    return s + t.amount;
  }, 0);
  const balanceAtAnchorMonthEnd = anchor.balance + flowAfterAnchorThisMonth;

  const monthlyFlow = new Map<string, number>();
  for (const ym of months) {
    monthlyFlow.set(ym, sumAmountInRange(rows, `${ym}-01`, lastDateOfMonth(ym)));
  }

  // アンカー月から前後に走査
  const balanceByMonth = new Map<string, number>();
  balanceByMonth.set(anchorMonth, balanceAtAnchorMonthEnd);

  // 過去方向
  let cursor = anchorMonth;
  while (cursor > earliest) {
    const prev = shiftMonth(cursor, -1);
    const flowCurMonth = monthlyFlow.get(cursor) ?? 0;
    balanceByMonth.set(prev, (balanceByMonth.get(cursor) ?? 0) - flowCurMonth);
    cursor = prev;
  }

  // 未来方向
  cursor = anchorMonth;
  while (cursor < latest) {
    const next = shiftMonth(cursor, 1);
    const flowNextMonth = monthlyFlow.get(next) ?? 0;
    balanceByMonth.set(next, (balanceByMonth.get(cursor) ?? 0) + flowNextMonth);
    cursor = next;
  }

  return months.map((ym) => ({
    yearMonth: ym,
    balance: balanceByMonth.get(ym) ?? 0,
    flow: monthlyFlow.get(ym) ?? 0,
  }));
}

/**
 * 指定月のアンカー口座残高（推定）を返す。データが無ければ null。
 */
export async function getAccountBalanceForMonth(
  anchor: AccountAnchor,
  yearMonth: string,
): Promise<MonthlyBalance | null> {
  const series = await computeMonthlyBalances(anchor);
  return series.find((s) => s.yearMonth === yearMonth) ?? null;
}
