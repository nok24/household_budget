import type { TokenClient, TokenResponse } from '@/types/gis';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
// スコープ構成:
// - openid email profile: ログインユーザの識別（userinfo エンドポイント用）
// - drive.readonly: 既存CSV（MFが作成）の列挙・読み取り。drive.file ではフォルダ経由の列挙ができないため
// - drive.file: アプリが作成する budget.json / overrides.json の読み書き
const SCOPE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

let scriptPromise: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;

export function loadGisScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('GIS load failed')), {
        once: true,
      });
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GIS load failed'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function ensureTokenClient(clientId: string): TokenClient {
  if (tokenClient) return tokenClient;
  if (!window.google?.accounts.oauth2) {
    throw new Error('GIS not loaded yet');
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: '', // overridden per request
  });
  return tokenClient;
}

export interface RequestTokenOptions {
  /** silent re-auth (no consent UI). Fails if user not yet consented or session expired. */
  silent?: boolean;
  /** hint preferred email for account chooser */
  loginHint?: string;
}

export function requestToken(
  clientId: string,
  opts: RequestTokenOptions = {},
): Promise<TokenResponse> {
  return new Promise((resolve, reject) => {
    let client: TokenClient;
    try {
      client = ensureTokenClient(clientId);
    } catch (e) {
      reject(e);
      return;
    }
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      resolve(response);
    };
    try {
      client.requestAccessToken({
        // silent: 'none' を渡すと UI を一切出さず、無理なら error_description='interaction_required' 等で reject される。
        // 空文字列だと Google が必要に応じてアカウントチューザを出してしまうので silent 用途には使えない。
        prompt: opts.silent ? 'none' : 'consent',
        hint: opts.loginHint,
      });
    } catch (e) {
      reject(e);
    }
  });
}

export interface UserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<UserInfo>;
}

export function revokeToken(accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => resolve());
    } else {
      resolve();
    }
  });
}

export function parseAllowedEmails(env: string | undefined): string[] {
  if (!env) return [];
  return env
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
