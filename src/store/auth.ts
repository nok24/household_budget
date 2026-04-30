import { create } from 'zustand';
import {
  fetchUserInfo,
  loadGisScript,
  parseAllowedEmails,
  requestToken,
  revokeToken,
} from '@/lib/auth';

export type AuthStatus = 'idle' | 'authenticating' | 'ready' | 'unauthorized' | 'error';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  expiresAt: number | null; // epoch ms
  email: string | null;
  name: string | null;
  picture: string | null;
  error: string | null;

  init: () => Promise<void>;
  login: () => Promise<void>;
  silentRefresh: () => Promise<boolean>;
  ensureFreshToken: () => Promise<string | null>;
  logout: () => Promise<void>;
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const ALLOWED_EMAILS = parseAllowedEmails(import.meta.env.VITE_ALLOWED_EMAILS);

// 5分の余裕を見て期限切れ扱い
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

// 一度でも明示ログインに成功したらこのフラグを立て、以降のリロードで silent を試す。
// localStorage に置くだけで、トークンそのものは保存しない（メモリのみ）。
const ONCE_AUTHED_FLAG = 'household.auth.has-been-authed';
// silent 再認証に渡す loginHint を復元するための、最後に成功したログインのメールアドレス。
// トークンではないので XSS で漏れても被害は実質無し（ユーザ自身のメールアドレスのみ）。
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

function isAllowed(email: string): boolean {
  if (ALLOWED_EMAILS.length === 0) return true; // ホワイトリスト未設定 = 開発時は通す
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  accessToken: null,
  expiresAt: null,
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
    // トークンは復元せず、純粋にアカウント特定のためだけに使う。
    const lastEmail = recallEmail();
    if (lastEmail) {
      set({ email: lastEmail });
    }
    try {
      await loadGisScript();
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'GIS load failed',
      });
    }
  },

  async login() {
    set({ status: 'authenticating', error: null });
    try {
      const token = await requestToken(CLIENT_ID);
      const user = await fetchUserInfo(token.access_token);
      const expiresAt = Date.now() + token.expires_in * 1000;

      if (!isAllowed(user.email)) {
        await revokeToken(token.access_token);
        set({
          status: 'unauthorized',
          accessToken: null,
          expiresAt: null,
          email: user.email,
          name: user.name ?? null,
          picture: user.picture ?? null,
          error: null,
        });
        return;
      }

      markAuthedOnce();
      rememberEmail(user.email);
      set({
        status: 'ready',
        accessToken: token.access_token,
        expiresAt,
        email: user.email,
        name: user.name ?? null,
        picture: user.picture ?? null,
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'login failed',
      });
    }
  },

  async silentRefresh() {
    // メモリ上に email が無い場合は localStorage の最終ログインメールを使う（リロード直後はこっち）。
    const { email } = get();
    const hint = email ?? recallEmail() ?? undefined;
    try {
      const token = await requestToken(CLIENT_ID, { silent: true, loginHint: hint });
      const expiresAt = Date.now() + token.expires_in * 1000;
      // silent でも一応 user 情報を取り直す（メール変更などの稀ケース対策）
      const user = await fetchUserInfo(token.access_token);
      if (!isAllowed(user.email)) {
        await revokeToken(token.access_token);
        set({
          status: 'unauthorized',
          accessToken: null,
          expiresAt: null,
          email: user.email,
        });
        return false;
      }
      rememberEmail(user.email);
      set({
        status: 'ready',
        accessToken: token.access_token,
        expiresAt,
        email: user.email,
        name: user.name ?? null,
        picture: user.picture ?? null,
        error: null,
      });
      return true;
    } catch {
      // silent 失敗時は idle に戻して明示的なログインを促す
      set({
        status: 'idle',
        accessToken: null,
        expiresAt: null,
      });
      return false;
    }
  },

  async ensureFreshToken() {
    const { accessToken, expiresAt, silentRefresh } = get();
    if (accessToken && expiresAt && Date.now() < expiresAt - REFRESH_LEEWAY_MS) {
      return accessToken;
    }
    const ok = await silentRefresh();
    if (!ok) return null;
    return get().accessToken;
  },

  async logout() {
    const { accessToken } = get();
    if (accessToken) {
      await revokeToken(accessToken);
    }
    clearAuthedFlag();
    set({
      status: 'idle',
      accessToken: null,
      expiresAt: null,
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
