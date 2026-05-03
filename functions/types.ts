// Pages Functions の Env binding 定義。
// wrangler.toml と Cloudflare Pages の環境変数 / シークレット設定と一致させること。

export interface Env {
  // Cloudflare Bindings
  DB: D1Database;

  // 環境変数 (Cloudflare Pages の Environment variables)
  GOOGLE_CLIENT_ID: string;
  ALLOWED_EMAILS: string; // カンマ区切り
  ADMIN_EMAILS: string; // カンマ区切り
  /**
   * dev モードフラグ。`.dev.vars` で `IS_DEV=true` を設定すると HTTP でも cookie が動くよう
   * Secure / __Host- prefix を外す。本番では未設定 (= 空文字) のままにする。
   */
  IS_DEV?: string;
  /**
   * CSRF Origin/Referer 検証で許可するオリジン (カンマ区切り)。
   * 未設定の場合は Host ヘッダから自動算出 (= 自身のオリジンのみ許可)。
   */
  ALLOWED_ORIGINS?: string;

  // Secrets (`wrangler pages secret put` で投入)
  GOOGLE_CLIENT_SECRET: string; // Drive OAuth コールバック用
  DRIVE_TOKEN_AES_KEY: string; // base64 エンコードされた AES-256 鍵
}

/** セッション復元後に Hono context に乗せるユーザ情報 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

// Hono の context.env / context.var 型として再利用するためのエイリアス
export type AppBindings = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
};
