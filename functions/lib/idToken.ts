import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

// Workers の isolate 内で再利用するため module スコープに保持。
// jose 側で JWK の TTL に従ったキャッシュが効くので、毎リクエスト fetch にはならない。
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  }
  return cachedJwks;
}

export interface VerifiedIdToken {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

interface GoogleIdTokenPayload extends JWTPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Google ID Token を検証して payload を返す。
 * - aud === clientId 厳格一致
 * - iss は accounts.google.com / https://accounts.google.com のいずれか
 * - exp / iat は jose 側で自動チェック
 * - email_verified === true を要求
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<VerifiedIdToken> {
  const { payload } = await jwtVerify<GoogleIdTokenPayload>(idToken, getJwks(), {
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
    audience: clientId,
  });

  if (!payload.sub) {
    throw new Error('id_token missing sub');
  }
  if (!payload.email) {
    throw new Error('id_token missing email');
  }
  if (payload.email_verified !== true) {
    throw new Error('email not verified');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: true,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}
