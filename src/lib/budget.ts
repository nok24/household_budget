import type { BudgetConfig } from '@/types';
import { db } from './db';
import {
  createJsonFile,
  findConfigFile,
  getFileMeta,
  readJsonFile,
  updateJsonFile,
  type ConfigFileMeta,
} from './configFile';

export const BUDGET_FILE_NAME = 'budget.json';

const FILE_ID_KEY = 'budget.fileId';
const FOLDER_ID_KEY = 'budget.lastFolderId';

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
  budgets: { default: {}, monthly: {} },
  accountAnchors: [],
  settings: {
    fiscalMonthStartDay: 1,
    incomeCategoryId: '_income',
    excludeTransfers: true,
    excludeNonTarget: true,
  },
};

async function getCachedFileId(folderId: string): Promise<string | null> {
  const lastFolder = await db.meta.get(FOLDER_ID_KEY);
  if (typeof lastFolder?.value === 'string' && lastFolder.value !== folderId) {
    // フォルダが変わったらキャッシュ破棄
    await db.meta.delete(FILE_ID_KEY);
    await db.meta.put({ key: FOLDER_ID_KEY, value: folderId });
    return null;
  }
  if (!lastFolder) {
    await db.meta.put({ key: FOLDER_ID_KEY, value: folderId });
  }
  const r = await db.meta.get(FILE_ID_KEY);
  return typeof r?.value === 'string' ? r.value : null;
}

async function setCachedFileId(fileId: string): Promise<void> {
  await db.meta.put({ key: FILE_ID_KEY, value: fileId });
}

export interface LoadedBudget {
  config: BudgetConfig;
  meta: ConfigFileMeta;
  isNew: boolean;
}

export async function loadOrInitBudget(
  accessToken: string,
  folderId: string,
): Promise<LoadedBudget> {
  const cachedFileId = await getCachedFileId(folderId);

  if (cachedFileId) {
    try {
      const config = await readJsonFile<BudgetConfig>(accessToken, cachedFileId);
      const meta = await getFileMeta(accessToken, cachedFileId);
      return { config: mergeWithDefaults(config), meta, isNew: false };
    } catch (e) {
      console.warn('[budget] cached fileId failed, falling back to search', e);
    }
  }

  const found = await findConfigFile(accessToken, folderId, BUDGET_FILE_NAME);
  if (found) {
    try {
      const config = await readJsonFile<BudgetConfig>(accessToken, found.id);
      await setCachedFileId(found.id);
      return { config: mergeWithDefaults(config), meta: found, isNew: false };
    } catch (e) {
      console.warn('[budget] existing budget.json read failed', e);
    }
  }

  // 新規作成
  const created = await createJsonFile(accessToken, folderId, BUDGET_FILE_NAME, DEFAULT_BUDGET);
  await setCachedFileId(created.id);
  return { config: structuredClone(DEFAULT_BUDGET), meta: created, isNew: true };
}

export async function saveBudget(
  accessToken: string,
  fileId: string,
  config: BudgetConfig,
): Promise<ConfigFileMeta> {
  const meta = await updateJsonFile(accessToken, fileId, config);
  await setCachedFileId(meta.id);
  return meta;
}

function mergeWithDefaults(loaded: Partial<BudgetConfig>): BudgetConfig {
  return {
    version: 1,
    schemaVersion: loaded.schemaVersion ?? DEFAULT_BUDGET.schemaVersion,
    members: loaded.members ?? structuredClone(DEFAULT_BUDGET.members),
    categories: loaded.categories ?? [],
    categoryOrder: loaded.categoryOrder ?? [],
    budgets: {
      default: loaded.budgets?.default ?? {},
      monthly: loaded.budgets?.monthly ?? {},
    },
    accountAnchors: loaded.accountAnchors ?? [],
    settings: {
      fiscalMonthStartDay:
        loaded.settings?.fiscalMonthStartDay ?? DEFAULT_BUDGET.settings.fiscalMonthStartDay,
      incomeCategoryId:
        loaded.settings?.incomeCategoryId ?? DEFAULT_BUDGET.settings.incomeCategoryId,
      excludeTransfers:
        loaded.settings?.excludeTransfers ?? DEFAULT_BUDGET.settings.excludeTransfers,
      excludeNonTarget:
        loaded.settings?.excludeNonTarget ?? DEFAULT_BUDGET.settings.excludeNonTarget,
    },
  };
}

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

/**
 * 指定月の予算金額を返す。monthly[YYYY-MM] の上書きがあればそれ、なければ default。
 */
export function getMonthBudget(
  config: BudgetConfig | null,
  yearMonth: string,
  categoryKey: string,
): number {
  if (!config) return 0;
  const monthlyOverride = config.budgets.monthly[yearMonth]?.[categoryKey];
  if (typeof monthlyOverride === 'number') return monthlyOverride;
  const def = config.budgets.default[categoryKey];
  return typeof def === 'number' ? def : 0;
}

export function getTotalDefaultBudget(config: BudgetConfig | null): number {
  if (!config) return 0;
  return Object.values(config.budgets.default).reduce(
    (sum, v) => sum + (typeof v === 'number' ? v : 0),
    0,
  );
}

export function getTotalMonthBudget(config: BudgetConfig | null, yearMonth: string): number {
  if (!config) return 0;
  // default をベースに monthly[ym] で上書き、その合計
  const keys = new Set<string>([
    ...Object.keys(config.budgets.default),
    ...Object.keys(config.budgets.monthly[yearMonth] ?? {}),
  ]);
  let sum = 0;
  for (const k of keys) {
    sum += getMonthBudget(config, yearMonth, k);
  }
  return sum;
}
