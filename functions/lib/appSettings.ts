import { eq, inArray } from 'drizzle-orm';
import type { Database } from './db';
import { appSettings } from '../db/schema';

/**
 * app_settings は単純な KV ストア。アプリで使うキーをここで列挙して命名衝突を避ける。
 */
export const SETTING_KEYS = {
  /** 家計簿 (取引) CSV が置かれている Drive フォルダ ID */
  BUDGET_FOLDER_ID: 'budget_folder_id',
  /** 表示用フォルダ名 (admin が選んだ時点でのスナップショット、Drive 側で renamed されると陳腐化) */
  BUDGET_FOLDER_NAME: 'budget_folder_name',
  /** 資産推移 CSV が置かれている Drive フォルダ ID */
  ASSET_FOLDER_ID: 'asset_folder_id',
  /** 表示用フォルダ名 */
  ASSET_FOLDER_NAME: 'asset_folder_name',
  /** 直近の取引同期成功時刻 (unix ms) */
  LAST_SYNCED_TRANSACTIONS_AT: 'last_synced_transactions_at',
  /** 直近の資産同期成功時刻 (unix ms) */
  LAST_SYNCED_ASSETS_AT: 'last_synced_assets_at',
  /** BudgetConfig.settings (fiscalMonthStartDay 等) を JSON で保存 */
  BUDGET_SETTINGS_JSON: 'budget_settings_json',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function getSettings(
  db: Database,
  keys: readonly string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [...keys]));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getAllSettings(db: Database): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function putSetting(db: Database, key: string, value: string): Promise<void> {
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value },
  });
}

export async function putSettings(db: Database, entries: Record<string, string>): Promise<void> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  // D1 は batch INSERT もサポートするがフィールド数が多くないので個別 upsert で十分。
  for (const key of keys) {
    await putSetting(db, key, entries[key]!);
  }
}

export async function deleteSetting(db: Database, key: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}
