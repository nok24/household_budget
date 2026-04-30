import { db, type DbTransaction } from './db';

export interface MonthDiagnostic {
  yearMonth: string;
  total: number;
  positiveRows: number;       // amount > 0 の行数
  negativeRows: number;       // amount < 0 の行数
  zeroRows: number;
  transferRows: number;       // 振替フラグ=1
  nonTargetRows: number;      // 計算対象=0
  countedIncomeRows: number;  // 集計上の「収入」とみなせる行数（target=1 & transfer=0 & amount>0）
  countedExpenseRows: number; // 同 支出
  positiveTotalAmount: number;       // 正の額の単純合計（フラグ無視）
  countedIncomeAmount: number;       // 集計上の収入額
}

export async function getMonthlyDiagnostics(): Promise<MonthDiagnostic[]> {
  const all = await db.transactions.toArray();
  const map = new Map<string, MonthDiagnostic>();

  for (const t of all) {
    if (!t.yearMonth) continue;
    let m = map.get(t.yearMonth);
    if (!m) {
      m = {
        yearMonth: t.yearMonth,
        total: 0,
        positiveRows: 0,
        negativeRows: 0,
        zeroRows: 0,
        transferRows: 0,
        nonTargetRows: 0,
        countedIncomeRows: 0,
        countedExpenseRows: 0,
        positiveTotalAmount: 0,
        countedIncomeAmount: 0,
      };
      map.set(t.yearMonth, m);
    }
    m.total++;
    if (t.amount > 0) {
      m.positiveRows++;
      m.positiveTotalAmount += t.amount;
    } else if (t.amount < 0) {
      m.negativeRows++;
    } else {
      m.zeroRows++;
    }
    if (t.isTransfer) m.transferRows++;
    if (!t.isTarget) m.nonTargetRows++;
    if (t.isTarget && !t.isTransfer) {
      if (t.amount > 0) {
        m.countedIncomeRows++;
        m.countedIncomeAmount += t.amount;
      } else if (t.amount < 0) {
        m.countedExpenseRows++;
      }
    }
  }

  return [...map.values()].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

export async function getPositiveTransactionsForMonth(
  yearMonth: string,
): Promise<DbTransaction[]> {
  const arr = await db.transactions.where('yearMonth').equals(yearMonth).toArray();
  return arr.filter((t) => t.amount > 0).sort((a, b) => b.amount - a.amount);
}
