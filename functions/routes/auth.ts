import { Hono } from 'hono';
import type { AppBindings } from '../types';
import { verifyGoogleIdToken } from '../lib/idToken';
import { isAllowedEmail, parseEmailList } from '../lib/allowedEmails';
import { getDb } from '../lib/db';
import { users } from '../db/schema';
import { SESSION_TTL_SEC, createSession, deleteSession } from '../lib/session';
import {
  clearSessionCookie,
  parseCookieHeader,
  serializeSessionCookie,
  sessionCookieName,
} from '../lib/cookie';
import { requireAuth } from '../lib/authMiddleware';

export const authRouter = new Hono<AppBindings>();

interface LoginBody {
  idToken?: unknown;
}

authRouter.post('/login', async (c) => {
  const body = (await c.req.json().catch(() => null)) as LoginBody | null;
  if (!body || typeof body.idToken !== 'string' || !body.idToken) {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const idToken = body.idToken;

  let verified;
  try {
    verified = await verifyGoogleIdToken(idToken, c.env.GOOGLE_CLIENT_ID);
  } catch (e) {
    console.error('[auth/login] id_token verify failed', e);
    return c.json({ error: 'invalid_id_token' }, 401);
  }

  const allowed = parseEmailList(c.env.ALLOWED_EMAILS);
  if (!isAllowedEmail(verified.email, allowed)) {
    return c.json({ error: 'email_not_allowed', email: verified.email }, 403);
  }

  const db = getDb(c.env);
  const now = Date.now();

  // users upsert (email/name/picture は最新で更新)
  await db
    .insert(users)
    .values({
      id: verified.sub,
      email: verified.email,
      name: verified.name,
      picture: verified.picture,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: verified.email,
        name: verified.name,
        picture: verified.picture,
      },
    });

  const userAgent = c.req.header('user-agent') ?? null;
  const session = await createSession(db, { userId: verified.sub, userAgent });

  c.header('Set-Cookie', serializeSessionCookie(c.env, session.id, { maxAgeSec: SESSION_TTL_SEC }));

  const adminEmails = parseEmailList(c.env.ADMIN_EMAILS);
  return c.json({
    ok: true,
    user: {
      id: verified.sub,
      email: verified.email,
      name: verified.name,
      picture: verified.picture,
    },
    isAdmin: isAllowedEmail(verified.email, adminEmails),
  });
});

authRouter.post('/logout', async (c) => {
  const cookies = parseCookieHeader(c.req.header('cookie') ?? null);
  const sessionId = cookies.get(sessionCookieName(c.env));
  if (sessionId) {
    const db = getDb(c.env);
    await deleteSession(db, sessionId);
  }
  c.header('Set-Cookie', clearSessionCookie(c.env));
  return c.json({ ok: true });
});

/** /api/me は URL 上は /api 直下に置きたいので親ルータ側で `app.route` する。 */
export const meRouter = new Hono<AppBindings>();
meRouter.get('/me', requireAuth, (c) => {
  const user = c.var.user;
  const adminEmails = parseEmailList(c.env.ADMIN_EMAILS);
  return c.json({
    user,
    isAdmin: isAllowedEmail(user.email, adminEmails),
  });
});
