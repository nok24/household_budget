/**
 * Pages Functions API (`/api/*`) を呼び出す薄いラッパ。
 * - cookie ベース認証 (`credentials: 'include'`)
 * - 状態変更系 (POST/PUT/DELETE/PATCH) には `X-Requested-With: fetch` を自動付与 (Worker 側 CSRF 防御に対応)
 * - 401/403 を Result 型で扱える形に正規化
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ApiError {
  status: number;
  /** Worker から返ってきた JSON エラー本文 (あれば) */
  body: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const headers = new Headers(opts.headers ?? {});
  if (!SAFE_METHODS.has(method)) {
    headers.set('X-Requested-With', 'fetch');
  }

  const { body: rawBody, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    method,
    headers,
    credentials: 'include',
  };
  if (rawBody !== undefined) {
    if (typeof rawBody === 'string' || rawBody instanceof FormData) {
      init.body = rawBody;
    } else {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(rawBody);
    }
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    return {
      ok: false,
      error: {
        status: 0,
        body: { error: 'network_error', message: e instanceof Error ? e.message : String(e) },
      },
    };
  }

  let body: unknown = null;
  if (res.status !== 204) {
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await res.json().catch(() => null);
    } else {
      body = await res.text().catch(() => null);
    }
  }

  if (!res.ok) {
    return { ok: false, error: { status: res.status, body } };
  }
  return { ok: true, data: body as T };
}

export function apiGet<T>(path: string, opts: ApiFetchOptions = {}) {
  return apiFetch<T>(path, { ...opts, method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown, opts: ApiFetchOptions = {}) {
  return apiFetch<T>(path, { ...opts, method: 'POST', body });
}
