import type { BudgetConfig } from '@/types';
import { db } from './db';
import {
  createJsonFile,
  findConfigFile,
  getFileMeta,
  isAppNotAuthorizedToFile,
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
  budgets: { annual: {} },
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
  try {
    const meta = await updateJsonFile(accessToken, fileId, config);
    await setCachedFileId(meta.id);
    return meta;
  } catch (e) {
    if (!isAppNotAuthorizedToFile(e)) throw e;
    // 既存 budget.json はアプリ所有でない（手動配置 or 別クライアントID 由来）。
    // 同フォルダにアプリ所有の新規ファイルを作成してそちらに書き込む。
    // 古いファイルは drive.file スコープでは削除できないので、ユーザに手動削除を促す。
    const folderRow = await db.meta.get(FOLDER_ID_KEY);
    const folderId = typeof folderRow?.value === 'string' ? folderRow.value : null;
    if (!folderId) throw e;
    console.warn(
      `[budget] update 403 → fallback to create new ${BUDGET_FILE_NAME}. ` +
        `古い ${BUDGET_FILE_NAME} は Drive 上に残るので、確認後に手動で削除してください。`,
    );
    const created = await createJsonFile(accessToken, folderId, BUDGET_FILE_NAME, config);
    await setCachedFileId(created.id);
    return created;
  }
}

/**
 * 旧スキーマ（budgets.default[cat] = 月予算 + monthly[ym][cat] = 月別上書き）
 * からの自動マイグレーション。default × 12 を annual として採用。
 * monthly 上書きは月単位の調整なので annual には合算せず捨てる（lossy）。
 */
type LegacyBudgets = {
  default?: Record<string, number>;
  monthly?: Record<string, Record<string, number | string>>;
};

function migrateBudgets(
  loadedBudgets: LegacyBudgets | { annual?: Record<string, number> } | undefined,
): { annual: Record<string, number> } {
  if (!loadedBudgets) return { annual: {} };
  if ('annual' in loadedBudgets && loadedBudgets.annual) {
    return { annual: { ...loadedBudgets.annual } };
  }
  // 旧スキーマからのマイグレーション
  const legacy = loadedBudgets as LegacyBudgets;
  if (legacy.default) {
    const annual: Record<string, number> = {};
    for (const [k, v] of Object.entries(legacy.default)) {
      const n = typeof v === 'number' ? v : 0;
      if (n > 0) annual[k] = n * 12;
    }
    return { annual };
  }
  return { annual: {} };
}

function mergeWithDefaults(loaded: Partial<BudgetConfig>): BudgetConfig {
  return {
    version: 1,
    schemaVersion: loaded.schemaVersion ?? DEFAULT_BUDGET.schemaVersion,
    members: loaded.members ?? structuredClone(DEFAULT_BUDGET.members),
    categories: loaded.categories ?? [],
    categoryOrder: loaded.categoryOrder ?? [],
    budgets: migrateBudgets(loaded.budgets),
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
