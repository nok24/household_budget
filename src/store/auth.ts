import { create } from 'zustand';
import { loadGisScript, parseAllowedEmails, requestIdToken } from '@/lib/auth';
import { apiGet, apiPost } from '@/lib/api';

export type AuthStatus =
  | 'initializing'
  | 'idle'
  | 'authenticating'
  | 'ready'
  | 'unauthorized'
  | 'error';

export interface ServerSessionUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface ServerSession {
  user: ServerSessionUser;
  isAdmin: boolean;
}

interface AuthState {
  status: AuthStatus;
  /**
   * Pages Functions のセッション cookie 経由で確認できたユーザ情報。
   * これが set されていれば「サーバ的にログイン済み」とみなす。
   */
  serverSession: ServerSession | null;

  // 表示用フィールド (serverSession の影。silent 失敗時の email 表示用にも残す)
  email: string | null;
  name: string | null;
  picture: string | null;
  error: string | null;

  init: () => Promise<void>;
  login: () => Promise<void>;
  silentRefresh: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// フロント側でも一応 allowlist を持つが、本来の信頼境界は Worker 側にある。
// ここは UI 上のフィードバックを早めに出すための前段チェック。
const ALLOWED_EMAILS = parseAllowedEmails(import.meta.env.VITE_ALLOWED_EMAILS);
void ALLOWED_EMAILS; // 旧 client-side allowlist 判定で使っていた。Worker が真実なので未使用化。

// 一度でも明示ログインに成功したらこのフラグを立て、以降のリロードで silent を試す。
const ONCE_AUTHED_FLAG = 'household.auth.has-been-authed';
// silent 再認証に渡す loginHint を復元するための、最後に成功したログインのメールアドレス。
const LAST_EMAIL_KEY = 'household.auth.last-email';
function markAuthedOnce() {
  try {
    localStorage.setItem(ONCE_AUTHED_FLAG, '1');
  } catch {
    /* noop */
  }
}
function hasBeenAuthed(): boolean {
  try {
    return localStorage.getItem(ONCE_AUTHED_FLAG) === '1';
  } catch {
    return false;
  }
}
function clearAuthedFlag() {
  try {
    localStorage.removeItem(ONCE_AUTHED_FLAG);
    localStorage.removeItem(LAST_EMAIL_KEY);
  } catch {
    /* noop */
  }
}
function rememberEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    /* noop */
  }
}
function recallEmail(): string | null {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY);
  } catch {
    return null;
  }
}

interface MeResponse {
  user: ServerSessionUser;
  isAdmin: boolean;
}

interface LoginResponse {
  ok: true;
  user: ServerSessionUser;
  isAdmin: boolean;
}

/** Worker に ID Token を渡してセッション cookie を発行してもらう */
async function postIdTokenToServer(idToken: string): Promise<LoginResponse> {
  const result = await apiPost<LoginResponse>('/api/auth/login', { idToken });
  if (!result.ok) {
    const status = result.error.status;
    const body = result.error.body as { error?: string; email?: string } | null;
    if (status === 403 && body?.error === 'email_not_allowed') {
      const err: Error & { kind?: string; email?: string } = new Error(
        `email not allowed${body.email ? `: ${body.email}` : ''}`,
      );
      err.kind = 'email_not_allowed';
      err.email = body.email;
      throw err;
    }
    if (status === 401) {
      throw new Error('id_token rejected by server');
    }
    throw new Error(`login failed (${status})`);
  }
  return result.data;
}

async function fetchMe(): Promise<MeResponse | null> {
  const result = await apiGet<MeResponse>('/api/me');
  if (result.ok) return result.data;
  if (result.error.status === 401) return null;
  // 403 や 5xx は呼び出し元に委ねる
  return null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'initializing',
  serverSession: null,
  email: null,
  name: null,
  picture: null,
  error: null,

  async init() {
    if (!CLIENT_ID) {
      set({
        status: 'error',
        error: 'VITE_GOOGLE_CLIENT_ID が設定されていません',
      });
      return;
    }
    // 直近にログインしたメールを復元しておくと silent re-auth で loginHint として使える。
    const lastEmail = recallEmail();
    if (lastEmail) {
      set({ email: lastEmail });
    }

    // まずサーバの cookie が生きているかを確認する。生きていれば再認証不要。
    const me = await fetchMe();
    if (me) {
      markAuthedOnce();
      rememberEmail(me.user.email);
      set({
        status: 'ready',
        serverSession: { user: me.user, isAdmin: me.isAdmin },
        email: me.user.email,
        name: me.user.name,
        picture: me.user.picture,
        error: null,
      });
    } else {
      // cookie 無効/未ログイン。明示ログイン UI を出す状態へ。
      set({ status: 'idle' });
    }

    try {
      await loadGisScript();
    } catch (e) {
      // GIS 未ロードでもサーバセッションが生きていれば動作可能なので、
      // 既に ready ならエラーにせず、そうでなければエラー扱い。
      if (get().status !== 'ready') {
        set({
          status: 'error',
          error: e instanceof Error ? e.message : 'GIS load failed',
        });
      }
    }
  },

  async login() {
    if (!CLIENT_ID) {
      set({ status: 'error', error: 'VITE_GOOGLE_CLIENT_ID が設定されていません' });
      return;
    }
    set({ status: 'authenticating', error: null });
    try {
      // 1) ID Token 取得 (One Tap UI、明示ログインなので silent ではない)
      const lastEmail = recallEmail();
      const { credential } = await requestIdToken(CLIENT_ID, { loginHint: lastEmail ?? undefined });

      // 2) Worker にセッション発行を依頼
      const session = await postIdTokenToServer(credential);
      markAuthedOnce();
      rememberEmail(session.user.email);
      set({
        status: 'ready',
        serverSession: { user: session.user, isAdmin: session.isAdmin },
        email: session.user.email,
        name: session.user.name,
        picture: session.user.picture,
        error: null,
      });
    } catch (e) {
      const err = e as Error & { kind?: string; email?: string };
      if (err.kind === 'email_not_allowed') {
        set({
          status: 'unauthorized',
          serverSession: null,
          email: err.email ?? null,
          error: null,
        });
        return;
      }
      set({
        status: 'error',
        error: err.message || 'login failed',
      });
    }
  },

  async silentRefresh() {
    // まずサーバ cookie で復帰を試みる (これが最重要な経路)。
    const me = await fetchMe();
    if (me) {
      markAuthedOnce();
      rememberEmail(me.user.email);
      set({
        status: 'ready',
        serverSession: { user: me.user, isAdmin: me.isAdmin },
        email: me.user.email,
        name: me.user.name,
        picture: me.user.picture,
        error: null,
      });
      return true;
    }

    // cookie が切れていた場合のみ Google silent re-auth + サーバ login を再実行
    if (!CLIENT_ID) return false;
    try {
      const lastEmail = recallEmail();
      const { credential } = await requestIdToken(CLIENT_ID, {
        silent: true,
        loginHint: lastEmail ?? undefined,
      });
      const session = await postIdTokenToServer(credential);
      rememberEmail(session.user.email);
      set({
        status: 'ready',
        serverSession: { user: session.user, isAdmin: session.isAdmin },
        email: session.user.email,
        name: session.user.name,
        picture: session.user.picture,
        error: null,
      });
      return true;
    } catch (e) {
      const err = e as Error & { kind?: string; email?: string };
      if (err.kind === 'email_not_allowed') {
        set({
          status: 'unauthorized',
          serverSession: null,
          email: err.email ?? null,
        });
        return false;
      }
      // silent 失敗時は idle に戻して明示的なログインを促す
      set({
        status: 'idle',
        serverSession: null,
      });
      return false;
    }
  },

  async logout() {
    // 1) Worker のセッションを失効
    await apiPost('/api/auth/logout');
    // 2) GIS の auto select も無効化 (次回明示ログインを促す)
    try {
      window.google?.accounts.id.disableAutoSelect();
    } catch {
      /* noop */
    }
    clearAuthedFlag();
    set({
      status: 'idle',
      serverSession: null,
      email: null,
      name: null,
      picture: null,
      error: null,
    });
  },
}));

export function shouldAttemptSilentOnMount(): boolean {
  return hasBeenAuthed();
}
