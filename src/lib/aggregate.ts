import dayjs from 'dayjs';

/**
 * 取引 1 行分。Worker 側 `ApiTransaction` から `surrogateId` を除いた最小フィールド。
 *
 * 旧 `src/lib/db.ts` (Dexie) の `DbTransaction` をここに移し、TanStack Query 経由で
 * 取れた取引行 + override 適用済み配列のキャリア型として再利用する。型名は互換のため
 * `DbTransaction` のまま維持。
 */
export interface DbTransaction {
  id: string; // MF row ID (一意)
  sourceFileId: string;
  date: string; // YYYY-MM-DD
  yearMonth: string; // YYYY-MM
  amount: number;
  contentName: string;
  account: string;
  largeCategory: string;
  midCategory: string;
  memo: string;
  isTarget: boolean;
  isTransfer: boolean;
}

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
 * 指定カテゴリの店舗別 (contentName) 支出 TOP N。
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
 * 指定カテゴリの曜日別 平均支出。
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
 * 全取引行から重複除去した口座名 + 件数。
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
 * 全取引行から重複除去した大項目。
 */
export function distinctLargeCategoriesFromArray(applied: DbTransaction[]): string[] {
  const set = new Set<string>();
  for (const r of applied) set.add(r.largeCategory || '未分類');
  return [...set].sort();
}

export function shiftMonth(yearMonth: string, delta: number): string {
  return dayjs(`${yearMonth}-01`).add(delta, 'month').format('YYYY-MM');
}

/** YYYY-MM から年（YYYY）を取り出す */
export function getYear(yearMonth: string): string {
  return yearMonth.slice(0, 4);
}

/** その年の 1月から指定月までの月リスト */
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
