import type { Env } from '../types';

/**
 * AES-GCM (256bit) で短い秘匿文字列 (Drive refresh token 等) を暗号化する。
 * 鍵は env.DRIVE_TOKEN_AES_KEY (base64 エンコードの 32 バイト) を `wrangler pages secret put` で投入済み。
 *
 * 設計:
 * - IV はリクエスト毎にランダム 12B (AES-GCM 標準サイズ)
 * - keyId に 'v1' を立てておき、将来鍵ローテ時に複数バージョンを並走できる余地を作る
 */

const KEY_ID_CURRENT = 'v1';
const IV_BYTES = 12;

function base64ToBytes(b64: string): Uint8Array {
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}

async function importKey(env: Env): Promise<CryptoKey> {
  if (!env.DRIVE_TOKEN_AES_KEY) {
    throw new Error('DRIVE_TOKEN_AES_KEY is not configured');
  }
  const raw = base64ToBytes(env.DRIVE_TOKEN_AES_KEY);
  if (raw.length !== 32) {
    throw new Error(
      `DRIVE_TOKEN_AES_KEY must decode to 32 bytes (got ${raw.length}). Generate with: openssl rand -base64 32`,
    );
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export interface EncryptedBlob {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  keyId: string;
}

export async function encryptString(env: Env, plaintext: string): Promise<EncryptedBlob> {
  const key = await importKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ciphertext: new Uint8Array(ct), iv, keyId: KEY_ID_CURRENT };
}

export async function decryptString(env: Env, blob: EncryptedBlob): Promise<string> {
  if (blob.keyId !== KEY_ID_CURRENT) {
    throw new Error(`unknown key version: ${blob.keyId}`);
  }
  const key = await importKey(env);
  // crypto.subtle.decrypt は BufferSource を受け付ける。Uint8Array はそのまま渡せる。
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.iv }, key, blob.ciphertext);
  return new TextDecoder().decode(data);
}
