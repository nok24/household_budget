import { eq } from 'drizzle-orm';
import type { Env } from '../types';
import type { Database } from './db';
import { encryptedSecrets } from '../db/schema';
import { decryptString, encryptString } from './crypto';

/**
 * encrypted_secrets テーブルのキー一覧 (アプリで使う論理名)。
 * 増やすときはここに追加して値の用途を明記する。
 */
export const SECRET_KEYS = {
  /** Google Drive refresh token (admin が一度だけ OAuth 同意して投入) */
  DRIVE_REFRESH_TOKEN: 'drive_refresh_token',
} as const;

export type SecretKey = (typeof SECRET_KEYS)[keyof typeof SECRET_KEYS];

export async function putSecret(
  db: Database,
  env: Env,
  key: SecretKey,
  plaintext: string,
): Promise<void> {
  const blob = await encryptString(env, plaintext);
  const now = Date.now();
  await db
    .insert(encryptedSecrets)
    .values({
      key,
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      keyId: blob.keyId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: encryptedSecrets.key,
      set: {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        keyId: blob.keyId,
        updatedAt: now,
      },
    });
}

export async function getSecret(db: Database, env: Env, key: SecretKey): Promise<string | null> {
  const rows = await db
    .select()
    .from(encryptedSecrets)
    .where(eq(encryptedSecrets.key, key))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // drizzle (D1) は blob カラムを Uint8Array で返してくる。型は unknown 寄りなのでキャストで吸収。
  return decryptString(env, {
    ciphertext: row.ciphertext as Uint8Array,
    iv: row.iv as Uint8Array,
    keyId: row.keyId,
  });
}

export async function deleteSecret(db: Database, key: SecretKey): Promise<void> {
  await db.delete(encryptedSecrets).where(eq(encryptedSecrets.key, key));
}

export async function hasSecret(db: Database, key: SecretKey): Promise<boolean> {
  const rows = await db
    .select({ key: encryptedSecrets.key })
    .from(encryptedSecrets)
    .where(eq(encryptedSecrets.key, key))
    .limit(1);
  return rows.length > 0;
}
