import { Hono } from 'hono';
import type { AppBindings } from '../types';
import { requireAuth } from '../lib/authMiddleware';
import { getDb } from '../lib/db';
import {
  deleteOverrideRow,
  readAllOverrides,
  upsertOverrideRow,
  type OverrideInput,
} from '../lib/overridesConfig';

export const overridesRouter = new Hono<AppBindings>();

// 家族 2 人とも編集可能。admin 限定にはしない。
overridesRouter.use('*', requireAuth);

/** 全件返却。家庭規模なので 1 ペイロードで取り切る (transactions と同方針)。 */
overridesRouter.get('/', async (c) => {
  const db = getDb(c.env);
  const rows = await readAllOverrides(db);
  return c.json({ overrides: rows });
});

interface MutateBody {
  sourceFileId?: unknown;
  mfRowId?: unknown;
  largeCategory?: unknown;
  midCategory?: unknown;
  memo?: unknown;
  isTransferOverride?: unknown;
  excluded?: unknown;
}

/**
 * upsert。`sourceFileId` / `mfRowId` 必須 + 少なくとも 1 つの上書きフィールド必須。
 * 全 undefined は 400 (DELETE と意味を分離)。
 * `updatedBy` / `updatedAt` はサーバ側で必ず設定。
 */
overridesRouter.put('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as MutateBody | null;
  const parsed = parseUpsertBody(body);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, 400);
  }
  const db = getDb(c.env);
  const row = await upsertOverrideRow(db, parsed.key, parsed.input, c.var.user.id);
  return c.json({ override: row });
});

/** 個別削除。body で `(sourceFileId, mfRowId)` を受ける。 */
overridesRouter.delete('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as MutateBody | null;
  const key = parseKey(body);
  if (!key.ok) {
    return c.json({ error: key.error }, 400);
  }
  const db = getDb(c.env);
  await deleteOverrideRow(db, key.key);
  return new Response(null, { status: 204 });
});

// ─────────────────────────────────────────────────────────────
// validation helpers
// ─────────────────────────────────────────────────────────────

type ParseResult<T> = ({ ok: true } & T) | { ok: false; error: string };

function parseKey(
  body: MutateBody | null,
): ParseResult<{ key: { sourceFileId: string; mfRowId: string } }> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body_must_be_object' };
  }
  if (typeof body.sourceFileId !== 'string' || body.sourceFileId === '') {
    return { ok: false, error: 'sourceFileId_required' };
  }
  if (typeof body.mfRowId !== 'string' || body.mfRowId === '') {
    return { ok: false, error: 'mfRowId_required' };
  }
  return { ok: true, key: { sourceFileId: body.sourceFileId, mfRowId: body.mfRowId } };
}

function parseUpsertBody(
  body: MutateBody | null,
): ParseResult<{ key: { sourceFileId: string; mfRowId: string }; input: OverrideInput }> {
  const k = parseKey(body);
  if (!k.ok) return k;
  // body は parseKey 通過時点で非 null
  const b = body as MutateBody;
  const input: OverrideInput = {};
  if (b.largeCategory !== undefined) {
    if (b.largeCategory !== null && typeof b.largeCategory !== 'string') {
      return { ok: false, error: 'largeCategory_must_be_string_or_null' };
    }
    input.largeCategory = b.largeCategory as string | null;
  }
  if (b.midCategory !== undefined) {
    if (b.midCategory !== null && typeof b.midCategory !== 'string') {
      return { ok: false, error: 'midCategory_must_be_string_or_null' };
    }
    input.midCategory = b.midCategory as string | null;
  }
  if (b.memo !== undefined) {
    if (b.memo !== null && typeof b.memo !== 'string') {
      return { ok: false, error: 'memo_must_be_string_or_null' };
    }
    input.memo = b.memo as string | null;
  }
  if (b.isTransferOverride !== undefined) {
    if (b.isTransferOverride !== null && typeof b.isTransferOverride !== 'boolean') {
      return { ok: false, error: 'isTransferOverride_must_be_boolean_or_null' };
    }
    input.isTransferOverride = b.isTransferOverride as boolean | null;
  }
  if (b.excluded !== undefined) {
    if (b.excluded !== null && typeof b.excluded !== 'boolean') {
      return { ok: false, error: 'excluded_must_be_boolean_or_null' };
    }
    input.excluded = b.excluded as boolean | null;
  }
  if (Object.keys(input).length === 0) {
    return { ok: false, error: 'at_least_one_override_field_required' };
  }
  return { ok: true, key: k.key, input };
}
