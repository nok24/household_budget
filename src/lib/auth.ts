// Google Identity Services (GIS) のログイン経路。サーバセッション
// (`__Host-session` cookie) 発行のみに使い、Drive API のクライアント直叩きは廃止
// (PR-G で撤去)。
//
// scope は openid + email + profile のみ。Drive アクセスは Worker 側 (admin が一度
// だけ refresh_token を D1 に暗号化保存) が代理する。

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let scriptPromise: Promise<void> | null = null;

export function loadGisScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
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

export function parseAllowedEmails(env: string | undefined): string[] {
  if (!env) return [];
  return env
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// ID Token 取得 (GIS Sign-In API: google.accounts.id)
// アプリのサーバセッション (`__Host-session` cookie) 発行用に Pages Functions に POST する。
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
