import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../types';
import { isAllowedEmail, parseEmailList } from './allowedEmails';

/**
 * c.var.user (= requireAuth でセット済み) の email が ADMIN_EMAILS に含まれるかを検証する。
 * 必ず requireAuth と組み合わせて使う前提:
 *
 *   app.use('/api/admin/*', requireAuth, requireAdmin)
 */
export const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = c.var.user;
  if (!user) {
    // 通常ここには来ない (requireAuth が先に 401 を返す)。安全網。
    return c.json({ error: 'unauthorized' }, 401);
  }
  const adminEmails = parseEmailList(c.env.ADMIN_EMAILS);
  if (!isAllowedEmail(user.email, adminEmails)) {
    return c.json({ error: 'forbidden' }, 403);
  }
  return next();
};
