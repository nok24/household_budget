import type { BudgetConfig } from '@/types';

export const DEFAULT_BUDGET: BudgetConfig = {
  version: 1,
  schemaVersion: '2026.04',
  members: [
    { id: 'husband', name: '夫', color: '#7B8F6E', accountPatterns: [] },
    { id: 'wife', name: '妻', color: '#B8A78A', accountPatterns: [] },
    { id: 'shared', name: '共通', color: '#A89884', accountPatterns: [] },
  ],
  // categories は MF の大項目から自動拾い + ユーザ編集で育てる前提
  categories: [],
  categoryOrder: [],
  budgets: { annual: {} },
  accountAnchors: [],
  settings: {
    fiscalMonthStartDay: 1,
    incomeCategoryId: '_income',
    excludeTransfers: true,
    excludeNonTarget: true,
  },
};

/**
 * categoryOrder を尊重しつつ、利用可能な全カテゴリを並び替えて返す。
 * order に載っているものは順番通り、載っていないものは末尾に名前順で追加。
 */
export function orderCategories(
  config: BudgetConfig | null,
  available: Iterable<string>,
): string[] {
  const set = new Set<string>();
  for (const c of available) {
    if (c) set.add(c);
  }
  const order = config?.categoryOrder ?? [];
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const c of order) {
    if (set.has(c) && !seen.has(c)) {
      ordered.push(c);
      seen.add(c);
    }
  }
  const remaining = [...set].filter((c) => !seen.has(c)).sort((a, b) => a.localeCompare(b, 'ja'));
  return [...ordered, ...remaining];
}

/** カテゴリの年間予算（円）。未設定なら 0。 */
export function getAnnualBudget(config: BudgetConfig | null, categoryKey: string): number {
  if (!config) return 0;
  const v = config.budgets.annual[categoryKey];
  return typeof v === 'number' ? v : 0;
}

/** 全カテゴリの年間予算合計。 */
export function getAnnualTotalBudget(config: BudgetConfig | null): number {
  if (!config) return 0;
  return Object.values(config.budgets.annual).reduce(
    (sum, v) => sum + (typeof v === 'number' ? v : 0),
    0,
  );
}

/** 月按分（年間 / 12）。表示用の参考値で、データには持たない。 */
export function getMonthlyAllocated(config: BudgetConfig | null, categoryKey: string): number {
  return getAnnualBudget(config, categoryKey) / 12;
}

/**
 * その月末時点で「平均ペース」だと年間予算の何%消化していれば順当かを返す。
 * 月単位の単純按分: M月末なら M/12 × 100。
 */
export function getExpectedPaceAtMonth(yearMonth: string): number {
  const monthIdx = parseInt(yearMonth.slice(5, 7), 10);
  if (!Number.isFinite(monthIdx) || monthIdx < 1 || monthIdx > 12) return 0;
  return (monthIdx / 12) * 100;
}

export type PaceTone = 'over' | 'fast' | 'normal' | 'slow';

export interface PaceVerdict {
  label: string;
  tone: PaceTone;
  /** 期待ペースに対する差分 (pt) */
  diff: number;
}

/**
 * 実消化率と期待ペースを比べてラベル + 色味を返す。
 * しきい値は ±5pt を「平均的」、それ以上の乖離をハイ/スローに振り分け。
 * 100% を超えていれば常に「超過」。
 */
export function judgePace(actualPct: number, expectedPct: number): PaceVerdict {
  const diff = actualPct - expectedPct;
  if (actualPct > 100) return { label: '超過', tone: 'over', diff };
  if (diff > 5) return { label: 'ハイペース', tone: 'fast', diff };
  if (diff < -5) return { label: '余裕あり', tone: 'slow', diff };
  return { label: '平均的', tone: 'normal', diff };
}
