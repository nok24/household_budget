/**
 * Drive 接続用 OAuth 2.0 (Authorization Code Flow) のユーティリティ。
 * admin が一度だけ同意して refresh_token を発行 → encrypted_secrets に暗号化保存し、
 * 以降の Drive API アクセスは Worker から refresh_token → access_token 交換で行う。
 */

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** Drive 読み取り専用スコープ。書き込み (drive.file) は Phase 2 では使わない。 */
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export interface BuildAuthUrlOptions {
  clientId: string;
  /** Google が code を返すエンドポイント。/api/admin/drive/callback の絶対 URL */
  redirectUri: string;
  /** CSRF 対策: 256bit ランダムを cookie に保存し、callback でも一致確認 */
  state: string;
  /** デフォルト: drive.readonly */
  scope?: string;
  /** デフォルト: 'offline' (refresh_token を必ずもらう) */
  accessType?: 'offline' | 'online';
  /** デフォルト: 'consent' (常に同意画面 → refresh_token が再発行される) */
  prompt?: 'consent' | 'none' | 'select_account';
  /** 既知のメール (Google 側でアカウント選択を補助) */
  loginHint?: string;
}

export function buildAuthUrl(opts: BuildAuthUrlOptions): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: opts.scope ?? DRIVE_READONLY_SCOPE,
    state: opts.state,
    access_type: opts.accessType ?? 'offline',
    prompt: opts.prompt ?? 'consent',
    include_granted_scopes: 'true',
  });
  if (opts.loginHint) params.set('login_hint', opts.loginHint);
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export interface ExchangeCodeOptions {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface TokensResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: 'Bearer';
  refresh_token?: string;
  id_token?: string;
}

export async function exchangeCodeForTokens(opts: ExchangeCodeOptions): Promise<TokensResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export interface RefreshAccessTokenOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: 'Bearer';
}

export async function refreshAccessToken(
  opts: RefreshAccessTokenOptions,
): Promise<RefreshTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  // best-effort: 失敗しても呼び出し側で握りつぶす想定 (Drive 側に既に失効してる可能性もある)
  await fetch(GOOGLE_REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  });
}

/**
 * 256bit のランダム値を hex で返す (state パラメータ用)。
 */
export function generateOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
