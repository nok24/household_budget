/**
 * カンマ区切りの ALLOWED_EMAILS / ADMIN_EMAILS env を配列に正規化する。
 * 比較は lowercase + trim 済みで行えるよう、ここで小文字化までやってしまう。
 */
export function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string, allowed: string[]): boolean {
  // ホワイトリスト未設定は dev 時の利便性として許可するが、Worker 側では
  // 必ず ALLOWED_EMAILS を設定する運用とする。空配列は「誰も許可されない」と扱う。
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}
