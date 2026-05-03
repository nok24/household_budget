import { asc, eq } from 'drizzle-orm';
import type { Database } from './db';
import {
  accountAnchors,
  annualBudgets,
  categoryOrder as categoryOrderTable,
  members as membersTable,
} from '../db/schema';
import { SETTING_KEYS, getSetting, putSetting } from './appSettings';

/**
 * フロント (src/types/index.ts BudgetConfig) と JSON shape を揃える。
 * Worker と React で型は別定義だが、メンバー名を一致させて互換にする。
 */
export interface MemberDef {
  id: string;
  name: string;
  color: string;
  accountPatterns: string[];
}

export interface AccountAnchorDef {
  id: string;
  label: string;
  pattern: string;
  asOfDate: string;
  balance: number;
}

export interface BudgetSettings {
  fiscalMonthStartDay: number;
  incomeCategoryId: string;
  excludeTransfers: boolean;
  excludeNonTarget: boolean;
}

export interface BudgetConfig {
  version: 1;
  schemaVersion: string;
  members: MemberDef[];
  /** 旧 budget.json の categories は実質未使用なので空配列固定で互換維持 */
  categories: never[];
  categoryOrder: string[];
  budgets: { annual: Record<string, number> };
  accountAnchors: AccountAnchorDef[];
  settings: BudgetSettings;
}

const DEFAULT_SETTINGS: BudgetSettings = {
  fiscalMonthStartDay: 1,
  incomeCategoryId: '_income',
  excludeTransfers: true,
  excludeNonTarget: true,
};

const SCHEMA_VERSION = '2026.04';

export async function readBudgetConfig(db: Database): Promise<BudgetConfig> {
  const [memberRows, anchorRows, orderRows, annualRows, settingsJson] = await Promise.all([
    db.select().from(membersTable).orderBy(asc(membersTable.sortOrder)),
    db.select().from(accountAnchors).orderBy(asc(accountAnchors.label)),
    db.select().from(categoryOrderTable).orderBy(asc(categoryOrderTable.idx)),
    db.select().from(annualBudgets),
    getSetting(db, SETTING_KEYS.BUDGET_SETTINGS_JSON),
  ]);

  const members: MemberDef[] = memberRows.map((m) => ({
    id: m.id,
    name: m.name,
    color: m.color,
    accountPatterns: parseAccountPatterns(m.accountPatternsJson),
  }));

  const accountAnchorsArr: AccountAnchorDef[] = anchorRows.map((a) => ({
    id: a.id,
    label: a.label,
    pattern: a.pattern,
    asOfDate: a.asOfDate,
    balance: a.balance,
  }));

  const categoryOrder: string[] = orderRows.map((r) => r.name);

  const annual: Record<string, number> = {};
  for (const r of annualRows) {
    annual[r.category] = r.amount;
  }

  const settings = settingsJson ? safeParseSettings(settingsJson) : DEFAULT_SETTINGS;

  return {
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    members,
    categories: [],
    categoryOrder,
    budgets: { annual },
    accountAnchors: accountAnchorsArr,
    settings,
  };
}

/**
 * BudgetConfig を D1 に全置換で書き戻す。
 * 4 テーブルを順番に DELETE → INSERT する。途中失敗時は再 PUT で復旧。
 */
export async function writeBudgetConfig(db: Database, config: BudgetConfig): Promise<void> {
  // members
  await db.delete(membersTable);
  if (config.members.length > 0) {
    await db.insert(membersTable).values(
      config.members.map((m, i) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        accountPatternsJson: JSON.stringify(m.accountPatterns ?? []),
        sortOrder: i,
      })),
    );
  }

  // categoryOrder
  await db.delete(categoryOrderTable);
  if (config.categoryOrder.length > 0) {
    await db
      .insert(categoryOrderTable)
      .values(config.categoryOrder.map((name, idx) => ({ idx, name })));
  }

  // annual
  await db.delete(annualBudgets);
  const annualEntries = Object.entries(config.budgets.annual ?? {});
  if (annualEntries.length > 0) {
    await db
      .insert(annualBudgets)
      .values(annualEntries.map(([category, amount]) => ({ category, amount })));
  }

  // accountAnchors
  await db.delete(accountAnchors);
  if (config.accountAnchors.length > 0) {
    await db.insert(accountAnchors).values(
      config.accountAnchors.map((a) => ({
        id: a.id,
        label: a.label,
        pattern: a.pattern,
        asOfDate: a.asOfDate,
        balance: a.balance,
      })),
    );
  }

  // settings (KV)
  await putSetting(
    db,
    SETTING_KEYS.BUDGET_SETTINGS_JSON,
    JSON.stringify(config.settings ?? DEFAULT_SETTINGS),
  );
}

/**
 * D1 が空っぽかどうか (移行 dry-run / force 判定で使う)。
 * members / annualBudgets / accountAnchors のいずれかに行があれば「データあり」と判定。
 */
export async function hasBudgetData(db: Database): Promise<boolean> {
  const [m, a, n] = await Promise.all([
    db.select({ id: membersTable.id }).from(membersTable).limit(1),
    db.select({ id: accountAnchors.id }).from(accountAnchors).limit(1),
    db.select({ category: annualBudgets.category }).from(annualBudgets).limit(1),
  ]);
  return m.length > 0 || a.length > 0 || n.length > 0;
}

function parseAccountPatterns(json: string): string[] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function safeParseSettings(json: string): BudgetSettings {
  try {
    const v = JSON.parse(json) as Partial<BudgetSettings>;
    return {
      fiscalMonthStartDay:
        typeof v.fiscalMonthStartDay === 'number'
          ? v.fiscalMonthStartDay
          : DEFAULT_SETTINGS.fiscalMonthStartDay,
      incomeCategoryId:
        typeof v.incomeCategoryId === 'string'
          ? v.incomeCategoryId
          : DEFAULT_SETTINGS.incomeCategoryId,
      excludeTransfers:
        typeof v.excludeTransfers === 'boolean'
          ? v.excludeTransfers
          : DEFAULT_SETTINGS.excludeTransfers,
      excludeNonTarget:
        typeof v.excludeNonTarget === 'boolean'
          ? v.excludeNonTarget
          : DEFAULT_SETTINGS.excludeNonTarget,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * 入力 BudgetConfig の最低限のバリデーション。
 * 不正な型なら例外を投げる (ルートで 400 にする)。
 */
export function validateBudgetConfig(input: unknown): BudgetConfig {
  if (!input || typeof input !== 'object') throw new Error('budget_config_must_be_object');
  const o = input as Record<string, unknown>;

  if (!Array.isArray(o.members)) throw new Error('members_must_be_array');
  const members: MemberDef[] = (o.members as unknown[]).map((m, i) => {
    if (!m || typeof m !== 'object') throw new Error(`members[${i}]_invalid`);
    const mm = m as Record<string, unknown>;
    if (typeof mm.id !== 'string') throw new Error(`members[${i}].id_must_be_string`);
    if (typeof mm.name !== 'string') throw new Error(`members[${i}].name_must_be_string`);
    if (typeof mm.color !== 'string') throw new Error(`members[${i}].color_must_be_string`);
    const patterns = Array.isArray(mm.accountPatterns)
      ? mm.accountPatterns.filter((x): x is string => typeof x === 'string')
      : [];
    return { id: mm.id, name: mm.name, color: mm.color, accountPatterns: patterns };
  });

  if (!Array.isArray(o.categoryOrder)) throw new Error('categoryOrder_must_be_array');
  const categoryOrder: string[] = (o.categoryOrder as unknown[]).filter(
    (x): x is string => typeof x === 'string',
  );

  const budgets = o.budgets as Record<string, unknown> | undefined;
  if (!budgets || typeof budgets !== 'object') throw new Error('budgets_must_be_object');
  const annualRaw = (budgets as { annual?: unknown }).annual;
  if (!annualRaw || typeof annualRaw !== 'object' || Array.isArray(annualRaw)) {
    throw new Error('budgets.annual_must_be_object');
  }
  const annual: Record<string, number> = {};
  for (const [k, v] of Object.entries(annualRaw as Record<string, unknown>)) {
    if (typeof v !== 'number') throw new Error(`budgets.annual.${k}_must_be_number`);
    annual[k] = v;
  }

  const anchorsRaw = Array.isArray(o.accountAnchors) ? o.accountAnchors : [];
  const accountAnchorsArr: AccountAnchorDef[] = (anchorsRaw as unknown[]).map((a, i) => {
    if (!a || typeof a !== 'object') throw new Error(`accountAnchors[${i}]_invalid`);
    const aa = a as Record<string, unknown>;
    if (typeof aa.id !== 'string') throw new Error(`accountAnchors[${i}].id`);
    if (typeof aa.label !== 'string') throw new Error(`accountAnchors[${i}].label`);
    if (typeof aa.pattern !== 'string') throw new Error(`accountAnchors[${i}].pattern`);
    if (typeof aa.asOfDate !== 'string') throw new Error(`accountAnchors[${i}].asOfDate`);
    if (typeof aa.balance !== 'number') throw new Error(`accountAnchors[${i}].balance`);
    return {
      id: aa.id,
      label: aa.label,
      pattern: aa.pattern,
      asOfDate: aa.asOfDate,
      balance: aa.balance,
    };
  });

  const settingsRaw = (o.settings as Record<string, unknown> | undefined) ?? {};
  const settings: BudgetSettings = {
    fiscalMonthStartDay:
      typeof settingsRaw.fiscalMonthStartDay === 'number'
        ? settingsRaw.fiscalMonthStartDay
        : DEFAULT_SETTINGS.fiscalMonthStartDay,
    incomeCategoryId:
      typeof settingsRaw.incomeCategoryId === 'string'
        ? settingsRaw.incomeCategoryId
        : DEFAULT_SETTINGS.incomeCategoryId,
    excludeTransfers:
      typeof settingsRaw.excludeTransfers === 'boolean'
        ? settingsRaw.excludeTransfers
        : DEFAULT_SETTINGS.excludeTransfers,
    excludeNonTarget:
      typeof settingsRaw.excludeNonTarget === 'boolean'
        ? settingsRaw.excludeNonTarget
        : DEFAULT_SETTINGS.excludeNonTarget,
  };

  return {
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    members,
    categories: [],
    categoryOrder,
    budgets: { annual },
    accountAnchors: accountAnchorsArr,
    settings,
  };
}

// 個別 anchor 残高用ヘルパ (Phase 3 後段で使う想定。今は未使用)
export async function getAnchorById(db: Database, id: string): Promise<AccountAnchorDef | null> {
  const rows = await db.select().from(accountAnchors).where(eq(accountAnchors.id, id)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, label: r.label, pattern: r.pattern, asOfDate: r.asOfDate, balance: r.balance };
}
