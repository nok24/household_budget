import type { Config } from 'drizzle-kit';

// drizzle-kit のスキーマ定義は functions/db/schema.ts。
// migration は wrangler の D1 migrations と互換のディレクトリに出力する。

export default {
  schema: './functions/db/schema.ts',
  out: './functions/db/migrations',
  dialect: 'sqlite',
  // ローカル開発時の SQLite ファイル経由で `drizzle-kit studio` を使いたい場合は dbCredentials を別途設定
} satisfies Config;
