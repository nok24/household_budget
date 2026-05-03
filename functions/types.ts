// Pages Functions の Env binding 定義。
// wrangler.toml と Cloudflare Pages の環境変数 / シークレット設定と一致させること。

export interface Env {
  // Cloudflare Bindings
  DB: D1Database;

  // 環境変数 (Cloudflare Pages の Environment variables)
  GOOGLE_CLIENT_ID: string;
  ALLOWED_EMAILS: string; // カンマ区切り
  ADMIN_EMAILS: string; // カンマ区切り

  // Secrets (`wrangler pages secret put` で投入)
  GOOGLE_CLIENT_SECRET: string; // Drive OAuth コールバック用
  DRIVE_TOKEN_AES_KEY: string; // base64 エンコードされた AES-256 鍵
}

// Hono の context.env 型として再利用するためのエイリアス
export type AppBindings = {
  Bindings: Env;
};
