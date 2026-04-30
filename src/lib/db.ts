import Dexie, { type EntityTable } from 'dexie';

// IndexedDB 上のローカルキャッシュ。Drive上のCSVから取り込んだ取引と、
// 同期メタ情報・アプリの汎用 KV、ユーザの上書き（カテゴリ/振替/メモ等）を保持する。

export interface DbFile {
  driveFileId: string;
  name: string;
  modifiedTime: string; // RFC3339
  parsedAt: string;     // RFC3339
  rowCount: number;
}

export interface DbTransaction {
  id: string;            // MFのID（一意）
  date: string;          // YYYY-MM-DD（JST）
  yearMonth: string;     // YYYY-MM（集計用インデックス）
  amount: number;
  contentName: string;
  account: string;
  largeCategory: string;
  midCategory: string;
  memo: string;
  isTarget: boolean;
  isTransfer: boolean;
  sourceFileId: string;
}

export interface DbOverride {
  id: string;                       // transaction id を主キーとする
  largeCategory?: string;           // 大項目を上書き
  midCategory?: string;             // 中項目を上書き
  memo?: string;                    // メモを上書き
  isTransferOverride?: boolean;     // 振替フラグを手動で上書き
  excluded?: boolean;               // true の場合、集計から除外（isTarget=false 相当）
  updatedAt: string;
}

export interface DbMeta {
  key: string;
  value: unknown;
}

class HouseholdDb extends Dexie {
  files!: EntityTable<DbFile, 'driveFileId'>;
  transactions!: EntityTable<DbTransaction, 'id'>;
  overrides!: EntityTable<DbOverride, 'id'>;
  meta!: EntityTable<DbMeta, 'key'>;

  constructor() {
    super('household-budget');
    // v1: 初期スキーマ
    this.version(1).stores({
      files: 'driveFileId, modifiedTime',
      transactions: 'id, date, yearMonth, sourceFileId, largeCategory, midCategory, account',
      meta: 'key',
    });
    // v2: overrides ストア追加（既存データはそのまま）
    this.version(2).stores({
      files: 'driveFileId, modifiedTime',
      transactions: 'id, date, yearMonth, sourceFileId, largeCategory, midCategory, account',
      overrides: 'id, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new HouseholdDb();

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.files, db.transactions, db.overrides, db.meta, async () => {
    await db.files.clear();
    await db.transactions.clear();
    await db.overrides.clear();
    await db.meta.clear();
  });
}
