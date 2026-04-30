import { db, type DbOverride } from './db';
import {
  createJsonFile,
  findConfigFile,
  readJsonFile,
  updateJsonFile,
  type ConfigFileMeta,
} from './configFile';

export const OVERRIDES_FILE_NAME = 'overrides.json';
const FILE_ID_KEY = 'overrides.fileId';
const FOLDER_ID_KEY = 'overrides.lastFolderId';

export interface OverridesFile {
  version: 1;
  byTxId: Record<
    string,
    {
      largeCategory?: string;
      midCategory?: string;
      memo?: string;
      isTransferOverride?: boolean;
      excluded?: boolean;
      updatedAt: string;
    }
  >;
}

const EMPTY_OVERRIDES: OverridesFile = { version: 1, byTxId: {} };

async function getCachedFileId(folderId: string): Promise<string | null> {
  const lastFolder = await db.meta.get(FOLDER_ID_KEY);
  if (typeof lastFolder?.value === 'string' && lastFolder.value !== folderId) {
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

async function locateOrCreate(
  accessToken: string,
  folderId: string,
): Promise<{ data: OverridesFile; meta: ConfigFileMeta }> {
  const cachedFileId = await getCachedFileId(folderId);

  if (cachedFileId) {
    try {
      const data = await readJsonFile<OverridesFile>(accessToken, cachedFileId);
      const meta = await findConfigFile(accessToken, folderId, OVERRIDES_FILE_NAME);
      if (meta) {
        return { data: normalize(data), meta };
      }
    } catch (e) {
      console.warn('[overrides] cached fileId failed, falling back to search', e);
    }
  }

  const found = await findConfigFile(accessToken, folderId, OVERRIDES_FILE_NAME);
  if (found) {
    try {
      const data = await readJsonFile<OverridesFile>(accessToken, found.id);
      await setCachedFileId(found.id);
      return { data: normalize(data), meta: found };
    } catch (e) {
      console.warn('[overrides] existing overrides.json read failed', e);
    }
  }

  const created = await createJsonFile(
    accessToken,
    folderId,
    OVERRIDES_FILE_NAME,
    EMPTY_OVERRIDES,
  );
  await setCachedFileId(created.id);
  return { data: structuredClone(EMPTY_OVERRIDES), meta: created };
}

function normalize(loaded: Partial<OverridesFile> | null | undefined): OverridesFile {
  return {
    version: 1,
    byTxId: loaded?.byTxId ?? {},
  };
}

/**
 * Drive 上の overrides.json を読み込み、IndexedDB に上書き反映する。
 * 起動時 / 手動リフレッシュ時に呼ぶ。
 */
export async function pullOverridesFromDrive(
  accessToken: string,
  folderId: string,
): Promise<void> {
  const { data } = await locateOrCreate(accessToken, folderId);
  await db.transaction('rw', db.overrides, async () => {
    await db.overrides.clear();
    const entries = Object.entries(data.byTxId);
    if (entries.length === 0) return;
    const records: DbOverride[] = entries.map(([id, v]) => ({
      id,
      largeCategory: v.largeCategory,
      midCategory: v.midCategory,
      memo: v.memo,
      isTransferOverride: v.isTransferOverride,
      excluded: v.excluded,
      updatedAt: v.updatedAt,
    }));
    await db.overrides.bulkPut(records);
  });
}

/**
 * 現在の IndexedDB overrides 全体を Drive に書き戻す。
 * 編集後にデバウンスして呼ばれる想定（最後勝ち方式）。
 */
export async function pushOverridesToDrive(accessToken: string): Promise<void> {
  const r = await db.meta.get(FILE_ID_KEY);
  const fileId = typeof r?.value === 'string' ? r.value : null;
  if (!fileId) {
    throw new Error('overrides.json の fileId がキャッシュされていません。フォルダを再選択してください');
  }
  const all = await db.overrides.toArray();
  const file: OverridesFile = {
    version: 1,
    byTxId: Object.fromEntries(
      all.map((o) => [
        o.id,
        {
          largeCategory: o.largeCategory,
          midCategory: o.midCategory,
          memo: o.memo,
          isTransferOverride: o.isTransferOverride,
          excluded: o.excluded,
          updatedAt: o.updatedAt,
        },
      ]),
    ),
  };
  await updateJsonFile(accessToken, fileId, file);
}
