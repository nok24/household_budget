import { eq, lt } from 'drizzle-orm';
import type { Database } from './db';
import { sessions, users } from '../db/schema';

export const SESSION_TTL_SEC = 60 * 60 * 24 * 90; // 90日

function randomSessionId(): string {
  // 256bit ランダム → hex 64文字
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface CreateSessionInput {
  userId: string;
  userAgent: string | null;
}

export interface CreateSessionResult {
  id: string;
  expiresAt: number; // unix ms
}

export async function createSession(
  db: Database,
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const id = randomSessionId();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SEC * 1000;
  await db.insert(sessions).values({
    id,
    userId: input.userId,
    expiresAt,
    createdAt: now,
    userAgent: input.userAgent,
  });
  return { id, expiresAt };
}

export interface SessionWithUser {
  sessionId: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    picture: string | null;
  };
}

export async function findSessionWithUser(
  db: Database,
  sessionId: string,
): Promise<SessionWithUser | null> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      userEmail: users.email,
      userName: users.name,
      userPicture: users.picture,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    // 期限切れ。レースで残っていても無効扱い (purge は別途)。
    return null;
  }
  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    user: {
      id: row.userId,
      email: row.userEmail,
      name: row.userName,
      picture: row.userPicture,
    },
  };
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Cron 等で定期実行する用。Phase 1 では呼ばないが実装だけ用意。 */
export async function purgeExpiredSessions(db: Database): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
}
