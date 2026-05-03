import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function expectedOrigins(c: {
  env: AppBindings['Bindings'];
  req: { header: (name: string) => string | undefined; url: string };
}): Set<string> {
  const set = new Set<string>();
  if (c.env.ALLOWED_ORIGINS) {
    for (const o of c.env.ALLOWED_ORIGINS.split(',')) {
      const trimmed = o.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  // フォールバック: 自身のオリジン (request URL から算出)。Pages は同一オリジンなのでこれで十分。
  try {
    const u = new URL(c.req.url);
    set.add(`${u.protocol}//${u.host}`);
  } catch {
    /* noop */
  }
  return set;
}

function originOf(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  try {
    const u = new URL(headerValue);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * CSRF middleware.
 * - Safe methods (GET/HEAD/OPTIONS) は素通り
 * - 状態変更系は以下の両方を要求:
 *   - `X-Requested-With` ヘッダ存在 (cross-site `<form>` submit では送れないカスタムヘッダ)
 *   - `Origin` または `Referer` が許可オリジン一覧に一致
 */
export const csrfMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }

  const xrw = c.req.header('x-requested-with');
  if (!xrw) {
    return c.json({ error: 'csrf_missing_xrw' }, 403);
  }

  const allowed = expectedOrigins(c);
  const origin = originOf(c.req.header('origin')) ?? originOf(c.req.header('referer'));
  if (!origin || !allowed.has(origin)) {
    return c.json({ error: 'csrf_origin_mismatch' }, 403);
  }

  return next();
};
