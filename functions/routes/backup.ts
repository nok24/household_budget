import { Hono } from 'hono';
import type { AppBindings } from '../types';
import { getDb } from '../lib/db';
import { backupObjectKey, buildBackupJson, gzipString } from '../lib/backup';

/**
 * GitHub Actions cron が叩く backup endpoint。Bearer token 認証のみ
 * (admin cookie 経路はマシン-to-マシンで再現できないので別境界)。
 *
 * CSRF middleware は `app.use('*', csrfMiddleware)` で全 path に効いているので、
 * curl 側で `X-Requested-With: fetch` + `Origin` ヘッダを付ける運用にすれば通る。
 * Bearer token を回避手段にしないことで、誤って middleware を緩めなくて済む。
 */
export const backupRouter = new Hono<AppBindings>();

const D1_DATABASE_ID = '809f32e7-7644-4e51-8c41-c3b7acfdebb5';

backupRouter.post('/', async (c) => {
  const auth = c.req.header('authorization') ?? '';
  const expected = c.env.BACKUP_TOKEN;
  if (!expected) {
    console.error('[backup] BACKUP_TOKEN not configured');
    return c.json({ error: 'backup_token_not_configured' }, 500);
  }
  if (!constantTimeEquals(auth, `Bearer ${expected}`)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = getDb(c.env);
  const json = await buildBackupJson(db, D1_DATABASE_ID);
  const text = JSON.stringify(json);
  const gz = await gzipString(text);
  const key = backupObjectKey();

  await c.env.BACKUPS.put(key, gz, {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: {
      schemaVersion: json.schemaVersion,
      generatedAt: json.generatedAt,
      uncompressedBytes: String(text.length),
    },
  });

  return c.json({
    ok: true,
    key,
    sizeBytes: gz.length,
    uncompressedBytes: text.length,
    generatedAt: json.generatedAt,
    counts: Object.fromEntries(
      Object.entries(json.tables).map(([k, v]) => [k, (v as unknown[]).length]),
    ),
  });
});

/** タイミング攻撃を避けるため、文字列の長さを揃えて XOR 比較。 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
