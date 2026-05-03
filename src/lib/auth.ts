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

// ─────────────────────────────────────────────────────────────
// ID Token 取得 (GIS Sign-In API: google.accounts.id)
// access token 取得 (initTokenClient) とは別経路。アプリのサーバセッション
// (`__Host-session` cookie) 発行用に Pages Functions に POST する。
// ─────────────────────────────────────────────────────────────

let idInitialized = false;
let pendingIdResolver: ((result: { credential: string }) => void) | null = null;
let pendingIdRejecter: ((err: Error) => void) | null = null;

function ensureIdClient(clientId: string, opts: { loginHint?: string }): void {
  if (!window.google?.accounts.id) {
    throw new Error('GIS (id) not loaded yet');
  }
  // initialize は同じ client_id でも hint を変えるたびに再 init する。
  // 同じ設定で複数回呼んでも GIS 側で冪等に扱われる。
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      const r = pendingIdResolver;
      const reject = pendingIdRejecter;
      pendingIdResolver = null;
      pendingIdRejecter = null;
      if (response.credential) {
        r?.({ credential: response.credential });
      } else {
        reject?.(new Error('id_token callback received without credential'));
      }
    },
    auto_select: false,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
    hint: opts.loginHint,
  });
  idInitialized = true;
}

export interface RequestIdTokenOptions {
  loginHint?: string;
  /** silent (One Tap UI) を試みる。失敗時は明示的に reject される。 */
  silent?: boolean;
}

/**
 * Google ID Token を取得する。
 * - silent=true: One Tap (`prompt`) で表示が抑止された/スキップされたら reject
 * - silent=false: One Tap を出す。ユーザがキャンセル/タップ外しした場合も reject
 *
 * 利用側は失敗時に明示ログイン UI 経由 (renderSignInButton 等) でリトライさせること。
 */
export function requestIdToken(
  clientId: string,
  opts: RequestIdTokenOptions = {},
): Promise<{ credential: string }> {
  return new Promise((resolve, reject) => {
    try {
      ensureIdClient(clientId, { loginHint: opts.loginHint });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    if (pendingIdResolver || pendingIdRejecter) {
      reject(new Error('id_token request already in progress'));
      return;
    }
    pendingIdResolver = resolve;
    pendingIdRejecter = reject;

    window.google!.accounts.id.prompt((notification) => {
      // notification は表示の挙動 (skipped/notDisplayed/dismissed) を伝える。
      // credential が返れば callback が走るのでここでは reject 判定だけする。
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        if (pendingIdRejecter) {
          const reason = notification.isNotDisplayed()
            ? notification.getNotDisplayedReason()
            : notification.getSkippedReason();
          const reject = pendingIdRejecter;
          pendingIdResolver = null;
          pendingIdRejecter = null;
          reject(new Error(`id_token prompt suppressed: ${reason}`));
        }
      }
    });
  });
}

/**
 * 任意の DOM 要素に GIS Sign-In ボタンを描画する。明示ログインの UI 経路として使う。
 * 描画時に initialize 済みである必要があるので requestIdToken と組み合わせて利用する。
 */
export function renderSignInButton(
  clientId: string,
  parent: HTMLElement,
  opts: {
    loginHint?: string;
    onCredential: (idToken: string) => void;
  },
): void {
  if (!window.google?.accounts.id) {
    throw new Error('GIS (id) not loaded yet');
  }
  // initialize はボタンとも共有される。コールバックを onCredential に向ける。
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (response.credential) {
        opts.onCredential(response.credential);
      }
    },
    auto_select: false,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
    hint: opts.loginHint,
  });
  idInitialized = true;
  window.google.accounts.id.renderButton(parent, {
    type: 'standard',
    theme: 'filled_blue',
    text: 'signin_with',
    shape: 'rectangular',
    size: 'large',
    logo_alignment: 'left',
  });
}

export function isIdInitialized(): boolean {
  return idInitialized;
}
