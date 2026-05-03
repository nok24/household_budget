import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../types';
import { parseCookieHeader, sessionCookieName } from './cookie';
import { findSessionWithUser } from './session';
import { getDb } from './db';

/**
 * cookie からセッションを解決し、見つかれば c.var.user にセットする。
 * 見つからなければ 401 を返す。
 */
export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const cookies = parseCookieHeader(c.req.header('cookie') ?? null);
  const sessionId = cookies.get(sessionCookieName(c.env));
  if (!sessionId) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const db = getDb(c.env);
  const session = await findSessionWithUser(db, sessionId);
  if (!session) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  c.set('user', session.user);
  return next();
};
