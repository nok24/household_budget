import { and, eq } from 'drizzle-orm';
import type { Database } from './db';
import { csvFiles, overrides, transactions } from '../db/schema';

/**
 * 取引上書き 1 行分のシリアライズ shape (API レスポンスとしてもそのまま返す)。
 *
 * `(sourceFileId, mfRowId)` が複合 PK。フロント側 `DbOverride.id` の旧シリアライズ
 * (mfRowId だけを id に詰める) と互換させたいので、別途 mfRowId 単独でも参照しやすい形にしている。
 */
export interface OverrideRecord {
  sourceFileId: string;
  mfRowId: string;
  largeCategory: string | null;
  midCategory: string | null;
  memo: string | null;
  /** null なら振替判定は MF データのまま、true/false なら強制 */
  isTransferOverride: boolean | null;
  /** true なら集計から除外 */
  excluded: boolean | null;
  updatedBy: string | null;
  updatedAt: number;
}

/**
 * 入力受け入れ shape。少なくとも 1 つの上書きフィールドを持つ。
 * 全 undefined は API 層で 400 にする (DELETE と意味を分離)。
 */
export interface OverrideInput {
  largeCategory?: string | null;
  midCategory?: string | null;
  memo?: string | null;
  isTransferOverride?: boolean | null;
  excluded?: boolean | null;
}

export async function readAllOverrides(db: Database): Promise<OverrideRecord[]> {
  const rows = await db.select().from(overrides);
  return rows.map(toOverrideRecord);
}

/**
 * upsert 1 件。`updatedBy` / `updatedAt` はサーバ側で必ず設定する。
 */
export async function upsertOverrideRow(
  db: Database,
  key: { sourceFileId: string; mfRowId: string },
  input: OverrideInput,
  updatedBy: string,
): Promise<OverrideRecord> {
  const updatedAt = Date.now();
  const values = {
    sourceFileId: key.sourceFileId,
    mfRowId: key.mfRowId,
    largeCategory: normalizeNullableText(input.largeCategory),
    midCategory: normalizeNullableText(input.midCategory),
    memo: normalizeNullableText(input.memo),
    isTransferOverride: nullableBoolToInt(input.isTransferOverride),
    excluded: nullableBoolToInt(input.excluded),
    updatedBy,
    updatedAt,
  };
  await db
    .insert(overrides)
    .values(values)
    .onConflictDoUpdate({
      target: [overrides.sourceFileId, overrides.mfRowId],
      set: {
        largeCategory: values.largeCategory,
        midCategory: values.midCategory,
        memo: values.memo,
        isTransferOverride: values.isTransferOverride,
        excluded: values.excluded,
        updatedBy: values.updatedBy,
        updatedAt: values.updatedAt,
      },
    });
  // 返却は select で再読込 (fetch から見て serializer 経由の値と必ず一致するように)
  const rows = await db
    .select()
    .from(overrides)
    .where(and(eq(overrides.sourceFileId, key.sourceFileId), eq(overrides.mfRowId, key.mfRowId)))
    .limit(1);
  if (rows.length === 0) {
    throw new Error('override_not_found_after_upsert');
  }
  return toOverrideRecord(rows[0]);
}

export async function deleteOverrideRow(
  db: Database,
  key: { sourceFileId: string; mfRowId: string },
): Promise<void> {
  await db
    .delete(overrides)
    .where(and(eq(overrides.sourceFileId, key.sourceFileId), eq(overrides.mfRowId, key.mfRowId)));
}

export async function hasOverridesData(db: Database): Promise<boolean> {
  const rows = await db.select({ sourceFileId: overrides.sourceFileId }).from(overrides).limit(1);
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────
// Drive overrides.json (旧フロント形式) → D1 移行
// ─────────────────────────────────────────────────────────────

/**
 * 旧 Drive `overrides.json` のレコード 1 件分の shape (`src/lib/overridesSync.ts` と一致)。
 * `byTxId` のキーは旧 `DbTransaction.id` = MF Row ID。
 */
export interface DriveOverridesEntry {
  largeCategory?: string;
  midCategory?: string;
  memo?: string;
  isTransferOverride?: boolean;
  excluded?: boolean;
  updatedAt?: string;
}

export interface DriveOverridesFile {
  version: 1;
  byTxId: Record<string, DriveOverridesEntry>;
}

export interface MigrateOverridesSummary {
  total: number;
  migrated: number;
  skipped: number;
  /** 同一 mfRowId が複数 sourceFile に存在し、最新を採用したケース数 */
  ambiguous: number;
}

export function validateDriveOverridesFile(input: unknown): DriveOverridesFile {
  if (!input || typeof input !== 'object') {
    throw new Error('overrides_json_must_be_object');
  }
  const o = input as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error('overrides_json_version_must_be_1');
  }
  const byTxIdRaw = o.byTxId;
  if (!byTxIdRaw || typeof byTxIdRaw !== 'object' || Array.isArray(byTxIdRaw)) {
    throw new Error('overrides_json_byTxId_must_be_object');
  }
  const byTxId: Record<string, DriveOverridesEntry> = {};
  for (const [k, v] of Object.entries(byTxIdRaw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const e = v as Record<string, unknown>;
    byTxId[k] = {
      largeCategory: typeof e.largeCategory === 'string' ? e.largeCategory : undefined,
      midCategory: typeof e.midCategory === 'string' ? e.midCategory : undefined,
      memo: typeof e.memo === 'string' ? e.memo : undefined,
      isTransferOverride:
        typeof e.isTransferOverride === 'boolean' ? e.isTransferOverride : undefined,
      excluded: typeof e.excluded === 'boolean' ? e.excluded : undefined,
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : undefined,
    };
  }
  return { version: 1, byTxId };
}

/**
 * Drive の旧 overrides.json を D1 に流し込む。
 *
 * mfRowId → sourceFileId の解決は `transactions` を全件 + `csv_files.parsedAt` で逆引き。
 * 候補 0 件 → skip + warning、1 件 → 採用、複数件 → parsedAt 最新を採用 (ambiguous++)。
 */
export async function migrateDriveOverrides(
  db: Database,
  drive: DriveOverridesFile,
  updatedBy: string,
): Promise<MigrateOverridesSummary> {
  // 1. txMap: mfRowId -> [{ sourceFileId, parsedAt }]
  const joined = await db
    .select({
      mfRowId: transactions.mfRowId,
      sourceFileId: transactions.sourceFileId,
      parsedAt: csvFiles.parsedAt,
    })
    .from(transactions)
    .leftJoin(csvFiles, eq(transactions.sourceFileId, csvFiles.driveFileId));
  const txMap = new Map<string, { sourceFileId: string; parsedAt: number }[]>();
  for (const r of joined) {
    const arr = txMap.get(r.mfRowId) ?? [];
    arr.push({ sourceFileId: r.sourceFileId, parsedAt: r.parsedAt ?? 0 });
    txMap.set(r.mfRowId, arr);
  }

  const summary: MigrateOverridesSummary = {
    total: 0,
    migrated: 0,
    skipped: 0,
    ambiguous: 0,
  };
  const now = Date.now();

  for (const [txId, entry] of Object.entries(drive.byTxId)) {
    summary.total += 1;
    const candidates = txMap.get(txId);
    if (!candidates || candidates.length === 0) {
      summary.skipped += 1;
      console.warn(`[migrate/overrides] skip mfRowId=${txId} (no matching transaction)`);
      continue;
    }
    let chosen = candidates[0];
    if (candidates.length > 1) {
      summary.ambiguous += 1;
      chosen = candidates.reduce((a, b) => (a.parsedAt >= b.parsedAt ? a : b));
    }
    const allEmpty =
      entry.largeCategory === undefined &&
      entry.midCategory === undefined &&
      entry.memo === undefined &&
      entry.isTransferOverride === undefined &&
      entry.excluded === undefined;
    if (allEmpty) {
      summary.skipped += 1;
      continue;
    }
    const updatedAt = parseDateMs(entry.updatedAt) ?? now;
    await db
      .insert(overrides)
      .values({
        sourceFileId: chosen.sourceFileId,
        mfRowId: txId,
        largeCategory: entry.largeCategory ?? null,
        midCategory: entry.midCategory ?? null,
        memo: entry.memo ?? null,
        isTransferOverride: nullableBoolToInt(entry.isTransferOverride),
        excluded: nullableBoolToInt(entry.excluded),
        updatedBy,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [overrides.sourceFileId, overrides.mfRowId],
        set: {
          largeCategory: entry.largeCategory ?? null,
          midCategory: entry.midCategory ?? null,
          memo: entry.memo ?? null,
          isTransferOverride: nullableBoolToInt(entry.isTransferOverride),
          excluded: nullableBoolToInt(entry.excluded),
          updatedBy,
          updatedAt,
        },
      });
    summary.migrated += 1;
  }

  return summary;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function toOverrideRecord(row: typeof overrides.$inferSelect): OverrideRecord {
  return {
    sourceFileId: row.sourceFileId,
    mfRowId: row.mfRowId,
    largeCategory: row.largeCategory,
    midCategory: row.midCategory,
    memo: row.memo,
    isTransferOverride: intToNullableBool(row.isTransferOverride),
    excluded: intToNullableBool(row.excluded),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

function normalizeNullableText(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  return v;
}

function nullableBoolToInt(v: boolean | null | undefined): number | null {
  if (v === undefined || v === null) return null;
  return v ? 1 : 0;
}

function intToNullableBool(v: number | null): boolean | null {
  if (v === null || v === undefined) return null;
  return v === 1;
}

function parseDateMs(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return t;
}
