import dayjs from 'dayjs';
import { db, type DbTransaction } from './db';
import { applyOverridesToRows } from './overrides';

export interface MonthSummary {
  yearMonth: string;
  income: number;
  expense: number;
  balance: number;
  count: number;
}

export interface CategoryAgg {
  name: string;
  amount: number;
  count: number;
}

export function isExpense(t: DbTransaction): boolean {
  return t.isTarget && !t.isTransfer && t.amount < 0;
}

export function isIncome(t: DbTransaction): boolean {
  return t.isTarget && !t.isTransfer && t.amount > 0;
}

export function shouldCount(t: DbTransaction): boolean {
  return t.isTarget && !t.isTransfer;
}

async function loadMonth(yearMonth: string): Promise<DbTransaction[]> {
  const raw = await db.transactions.where('yearMonth').equals(yearMonth).toArray();
  return applyOverridesToRows(raw);
}

// ─────────────────────────────────────────────────────────────
// Pure 版 (引数で applied 取引配列を受ける、TanStack Query 経由のフロント用)
// 既存の async 関数 (db.transactions / overrides を読む) はレガシーページ用に残す。
// ─────────────────────────────────────────────────────────────

export function summarizeMonth(applied: DbTransaction[], yearMonth: string): MonthSummary {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const t of applied) {
    if (t.yearMonth !== yearMonth) continue;
    if (!shouldCount(t)) continue;
    if (t.amount >= 0) income += t.amount;
    else expense += -t.amount;
    count += 1;
  }
  return { yearMonth, income, expense, balance: income - expense, count };
}

export function summarizeMonthlyTrend(
  applied: DbTransaction[],
  anchorYearMonth: string,
  monthsBack: number,
): MonthSummary[] {
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    months.push(shiftMonth(anchorYearMonth, -i));
  }
  return months.map((m) => summarizeMonth(applied, m));
}

export function summarizeYearToDate(applied: DbTransaction[], yearMonth: string): MonthSummary {
  const months = listYtdMonths(yearMonth);
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const m of months) {
    const s = summarizeMonth(applied, m);
    income += s.income;
    expense += s.expense;
    count += s.count;
  }
  return { yearMonth, income, expense, balance: income - expense, count };
}

export function breakdownCategories(applied: DbTransaction[], yearMonth: string): CategoryAgg[] {
  const map = new Map<string, CategoryAgg>();
  for (const t of applied) {
    if (t.yearMonth !== yearMonth) continue;
    if (!isExpense(t)) continue;
    const key = t.largeCategory || '未分類';
    const v = map.get(key) ?? { name: key, amount: 0, count: 0 };
    v.amount += -t.amount;
    v.count += 1;
    map.set(key, v);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function breakdownCategoriesYTD(applied: DbTransaction[], yearMonth: string): CategoryAgg[] {
  const months = listYtdMonths(yearMonth);
  const map = new Map<string, CategoryAgg>();
  for (const m of months) {
    for (const c of breakdownCategories(applied, m)) {
      const v = map.get(c.name) ?? { name: c.name, amount: 0, count: 0 };
      v.amount += c.amount;
      v.count += c.count;
      map.set(c.name, v);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function pickRecentTransactionsForMonth(
  applied: DbTransaction[],
  yearMonth: string,
  limit: number,
): DbTransaction[] {
  return applied
    .filter((t) => t.yearMonth === yearMonth && shouldCount(t))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);
}

export function listAvailableMonths(applied: DbTransaction[]): string[] {
  const set = new Set<string>();
  for (const t of applied) {
    if (t.yearMonth) set.add(t.yearMonth);
  }
  return [...set].sort();
}

/**
 * 指定カテゴリの月別支出 (直近 monthsBack ヶ月)。
 * `getCategoryMonthlyTrend` (Dexie 版) の pure 代替。
 */
export function categoryMonthlyTrend(
  applied: DbTransaction[],
  category: string,
  anchorYearMonth: string,
  monthsBack: number,
): { yearMonth: string; amount: number }[] {
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    months.push(shiftMonth(anchorYearMonth, -i));
  }
  // yearMonth で先 bucket
  const sums = new Map<string, number>();
  for (const m of months) sums.set(m, 0);
  for (const t of applied) {
    if (!isExpense(t)) continue;
    const key = t.largeCategory || '未分類';
    if (key !== category) continue;
    if (!sums.has(t.yearMonth)) continue;
    sums.set(t.yearMonth, (sums.get(t.yearMonth) ?? 0) + -t.amount);
  }
  return months.map((ym) => ({ yearMonth: ym, amount: sums.get(ym) ?? 0 }));
}

/**
 * 指定カテゴリの店舗別 (contentName) 支出 TOP N。pure 版。
 */
export function storeTopForCategory(
  applied: DbTransaction[],
  yearMonth: string,
  category: string,
  topN: number,
): { name: string; amount: number; count: number }[] {
  const map = new Map<string, { name: string; amount: number; count: number }>();
  for (const t of applied) {
    if (t.yearMonth !== yearMonth) continue;
    if (!isExpense(t)) continue;
    const key = t.largeCategory || '未分類';
    if (key !== category) continue;
    const name = t.contentName || '(不明)';
    const v = map.get(name) ?? { name, amount: 0, count: 0 };
    v.amount += -t.amount;
    v.count += 1;
    map.set(name, v);
  }
  const sorted = [...map.values()].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= topN) return sorted;
  const top = sorted.slice(0, topN - 1);
  const rest = sorted.slice(topN - 1);
  const restAmount = rest.reduce((s, r) => s + r.amount, 0);
  const restCount = rest.reduce((s, r) => s + r.count, 0);
  return [...top, { name: `その他（${rest.length}件）`, amount: restAmount, count: restCount }];
}

/**
 * 指定カテゴリの曜日別 平均支出。pure 版。
 */
export function dayOfWeekAverageForCategory(
  applied: DbTransaction[],
  yearMonth: string,
  category: string,
): { dow: number; label: string; average: number }[] {
  const sums: number[] = [0, 0, 0, 0, 0, 0, 0];
  const counts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const t of applied) {
    if (t.yearMonth !== yearMonth) continue;
    if (!isExpense(t)) continue;
    const key = t.largeCategory || '未分類';
    if (key !== category) continue;
    if (!t.date) continue;
    const dow = dayjs(t.date).day();
    sums[dow] += -t.amount;
    counts[dow] += 1;
  }
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  return labels.map((label, dow) => ({
    dow,
    label,
    average: counts[dow] > 0 ? sums[dow] / counts[dow] : 0,
  }));
}

/**
 * 全取引行から重複除去した口座名 + 件数。pure 版。
 */
export function distinctAccountsFromArray(
  applied: DbTransaction[],
): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of applied) {
    if (!t.account) continue;
    map.set(t.account, (map.get(t.account) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 全取引行から重複除去した大項目。pure 版。
 */
export function distinctLargeCategoriesFromArray(applied: DbTransaction[]): string[] {
  const set = new Set<string>();
  for (const r of applied) set.add(r.largeCategory || '未分類');
  return [...set].sort();
}

export async function getMonthSummary(yearMonth: string): Promise<MonthSummary> {
  const rows = await loadMonth(yearMonth);
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const t of rows) {
    if (!shouldCount(t)) continue;
    if (t.amount >= 0) income += t.amount;
    else expense += -t.amount;
    count += 1;
  }
  return { yearMonth, income, expense, balance: income - expense, count };
}

export function shiftMonth(yearMonth: string, delta: number): string {
  return dayjs(`${yearMonth}-01`).add(delta, 'month').format('YYYY-MM');
}

export async function getMonthlyTrend(
  anchorYearMonth: string,
  monthsBack: number,
): Promise<MonthSummary[]> {
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    months.push(shiftMonth(anchorYearMonth, -i));
  }
  return Promise.all(months.map((m) => getMonthSummary(m)));
}

/** YYYY-MM から年（YYYY）を取り出す */
export function getYear(yearMonth: string): string {
  return yearMonth.slice(0, 4);
}

/** その年の 1月から指定月までの月リストを返す */
function listYtdMonths(yearMonth: string): string[] {
  const year = getYear(yearMonth);
  const months: string[] = [];
  let cur = `${year}-01`;
  while (cur <= yearMonth) {
    months.push(cur);
    cur = shiftMonth(cur, 1);
  }
  return months;
}

/**
 * その年の1月〜selectedMonth までの累計サマリ（年初来 / Year-To-Date）。
 * 集計ルールは getMonthSummary と同じ（isTarget && !isTransfer のみ）。
 */
export async function getYearToDateSummary(yearMonth: string): Promise<MonthSummary> {
  const months = listYtdMonths(yearMonth);
  const summaries = await Promise.all(months.map((m) => getMonthSummary(m)));
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const s of summaries) {
    income += s.income;
    expense += s.expense;
    count += s.count;
  }
  return { yearMonth, income, expense, balance: income - expense, count };
}

/**
 * その年の1月〜selectedMonth までのカテゴリ別累計支出。
 */
export async function getCategoryBreakdownYTD(yearMonth: string): Promise<CategoryAgg[]> {
  const months = listYtdMonths(yearMonth);
  const perMonth = await Promise.all(months.map((m) => getCategoryBreakdown(m)));
  const map = new Map<string, CategoryAgg>();
  for (const list of perMonth) {
    for (const c of list) {
      const v = map.get(c.name) ?? { name: c.name, amount: 0, count: 0 };
      v.amount += c.amount;
      v.count += c.count;
      map.set(c.name, v);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export async function getCategoryBreakdown(yearMonth: string): Promise<CategoryAgg[]> {
  const rows = await loadMonth(yearMonth);
  const map = new Map<string, CategoryAgg>();
  for (const t of rows) {
    if (!isExpense(t)) continue;
    const key = t.largeCategory || '未分類';
    const v = map.get(key) ?? { name: key, amount: 0, count: 0 };
    v.amount += -t.amount;
    v.count += 1;
    map.set(key, v);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export async function getRecentTransactionsForMonth(
  yearMonth: string,
  limit: number,
): Promise<DbTransaction[]> {
  const rows = await loadMonth(yearMonth);
  // 集計と表示を一致させるため、計算対象=1 かつ 振替=0 の行のみを表示
  const filtered = rows.filter(shouldCount);
  filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return filtered.slice(0, limit);
}

export async function getAvailableMonths(): Promise<string[]> {
  const set = new Set<string>();
  await db.transactions.each((t) => {
    if (t.yearMonth) set.add(t.yearMonth);
  });
  return [...set].sort();
}

export async function getAllTransactionsApplied(): Promise<DbTransaction[]> {
  const raw = await db.transactions.toArray();
  return applyOverridesToRows(raw);
}

export async function getDistinctLargeCategoriesApplied(): Promise<string[]> {
  const rows = await getAllTransactionsApplied();
  const set = new Set<string>();
  for (const r of rows) set.add(r.largeCategory || '未分類');
  return [...set].sort();
}

export async function getDistinctAccounts(): Promise<{ name: string; count: number }[]> {
  const map = new Map<string, number>();
  await db.transactions.each((t) => {
    if (!t.account) return;
    map.set(t.account, (map.get(t.account) ?? 0) + 1);
  });
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 指定カテゴリの月別支出（直近 monthsBack ヶ月）。
 */
export async function getCategoryMonthlyTrend(
  category: string,
  anchorYearMonth: string,
  monthsBack: number,
): Promise<{ yearMonth: string; amount: number }[]> {
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    months.push(shiftMonth(anchorYearMonth, -i));
  }
  const results = await Promise.all(
    months.map(async (ym) => {
      const rows = await loadMonth(ym);
      let total = 0;
      for (const t of rows) {
        if (!isExpense(t)) continue;
        const key = t.largeCategory || '未分類';
        if (key !== category) continue;
        total += -t.amount;
      }
      return { yearMonth: ym, amount: total };
    }),
  );
  return results;
}

/**
 * 指定カテゴリの店舗別（contentName）支出 TOP N。
 */
export async function getStoreTopForCategory(
  yearMonth: string,
  category: string,
  topN: number,
): Promise<{ name: string; amount: number; count: number }[]> {
  const rows = await loadMonth(yearMonth);
  const map = new Map<string, { name: string; amount: number; count: number }>();
  for (const t of rows) {
    if (!isExpense(t)) continue;
    const key = t.largeCategory || '未分類';
    if (key !== category) continue;
    const name = t.contentName || '(不明)';
    const v = map.get(name) ?? { name, amount: 0, count: 0 };
    v.amount += -t.amount;
    v.count += 1;
    map.set(name, v);
  }
  const sorted = [...map.values()].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= topN) return sorted;
  const top = sorted.slice(0, topN - 1);
  const rest = sorted.slice(topN - 1);
  const restAmount = rest.reduce((s, r) => s + r.amount, 0);
  const restCount = rest.reduce((s, r) => s + r.count, 0);
  return [...top, { name: `その他（${rest.length}件）`, amount: restAmount, count: restCount }];
}

/**
 * 指定カテゴリの曜日別 平均支出。
 */
export async function getDayOfWeekAverageForCategory(
  yearMonth: string,
  category: string,
): Promise<{ dow: number; label: string; average: number }[]> {
  const rows = await loadMonth(yearMonth);
  const sums: number[] = [0, 0, 0, 0, 0, 0, 0];
  const counts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const t of rows) {
    if (!isExpense(t)) continue;
    const key = t.largeCategory || '未分類';
    if (key !== category) continue;
    if (!t.date) continue;
    const dow = dayjs(t.date).day();
    sums[dow] += -t.amount;
    counts[dow] += 1;
  }
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  return labels.map((label, dow) => ({
    dow,
    label,
    average: counts[dow] > 0 ? sums[dow] / counts[dow] : 0,
  }));
}
