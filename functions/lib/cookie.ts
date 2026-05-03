import type { Env } from '../types';

/**
 * 本番では `__Host-session` (Secure 必須、Path=/、Domain 指定不可)。
 * dev (`IS_DEV=true`) は wrangler pages dev が HTTP のため Secure を付けると cookie が
 * 飛ばないので、prefix なしの `session` を使う。
 */
export function sessionCookieName(env: Env): string {
  return isDev(env) ? 'session' : '__Host-session';
}

export function isDev(env: Env): boolean {
  return env.IS_DEV === 'true' || env.IS_DEV === '1';
}

export interface SerializeCookieOptions {
  maxAgeSec: number;
}

export function serializeSessionCookie(
  env: Env,
  sessionId: string,
  opts: SerializeCookieOptions,
): string {
  const dev = isDev(env);
  const parts = [
    `${sessionCookieName(env)}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${opts.maxAgeSec}`,
  ];
  if (!dev) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(env: Env): string {
  const dev = isDev(env);
  const parts = [`${sessionCookieName(env)}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (!dev) parts.push('Secure');
  return parts.join('; ');
}

/** Cookie ヘッダ文字列を Map<name, value> に分解する */
export function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) map.set(name, value);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// Drive OAuth state cookie (CSRF 対策、callback 時に value 一致を検証)
// ─────────────────────────────────────────────────────────────

export const DRIVE_OAUTH_STATE_TTL_SEC = 10 * 60; // 10 分

export function driveOAuthStateCookieName(env: Env): string {
  return isDev(env) ? 'drive_oauth_state' : '__Host-drive-oauth-state';
}

export function serializeDriveOAuthStateCookie(env: Env, state: string): string {
  const dev = isDev(env);
  const parts = [
    `${driveOAuthStateCookieName(env)}=${state}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${DRIVE_OAUTH_STATE_TTL_SEC}`,
  ];
  if (!dev) parts.push('Secure');
  return parts.join('; ');
}

export function clearDriveOAuthStateCookie(env: Env): string {
  const dev = isDev(env);
  const parts = [
    `${driveOAuthStateCookieName(env)}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ];
  if (!dev) parts.push('Secure');
  return parts.join('; ');
}
