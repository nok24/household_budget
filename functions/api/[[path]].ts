import { Hono } from 'hono';
import type { AppBindings, Env } from '../types';
import { csrfMiddleware } from '../lib/csrf';
import { authRouter, meRouter } from '../routes/auth';

// Pages Functions のキャッチオール。`/api/*` の全リクエストを Hono にディスパッチする。
// 各サブルータは ./routes/ 配下に分割していき、ここに mount する。

const app = new Hono<AppBindings>();

// 全ルートに CSRF middleware を適用 (safe methods は素通り、状態変更系のみ Origin/X-Requested-With 検証)
app.use('*', csrfMiddleware);

// ヘルスチェック (Phase 0 動作確認用)
app.get('/api/health', (c) =>
  c.json({
    ok: true,
    runtime: 'pages-functions',
    timestamp: new Date().toISOString(),
  }),
);

// 認証 (Phase 1)
app.route('/api/auth', authRouter);
app.route('/api', meRouter);

// 未マッチは 404
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// 例外は 500 (本番でスタックは隠す)
app.onError((err, c) => {
  console.error('[api] unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

export const onRequest: PagesFunction<Env> = (context) => {
  // Hono の executionCtx 引数として Pages の context を渡す。
  // Pages の EventContext には Workers の ExecutionContext と同じ waitUntil/passThroughOnException を持つので
  // 型定義の差を吸収するキャスト。
  return app.fetch(context.request, context.env, context as unknown as ExecutionContext);
};
