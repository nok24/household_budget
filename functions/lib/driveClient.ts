import type { Env } from '../types';
import type { Database } from './db';
import { getSecret, SECRET_KEYS } from './secrets';
import { refreshAccessToken } from './driveOAuth';

/**
 * Worker から Google Drive API を叩くためのクライアント。
 * encrypted_secrets に保存された refresh_token を使って access_token を発行 → メモリにキャッシュし、
 * 必要な API (folder list / file download) を薄くラップする。
 *
 * isolate ローカルキャッシュ: Cloudflare Workers の各 isolate は数十秒〜数分の寿命があり、
 * 同じ isolate 上の連続リクエストではキャッシュ参照だけで Drive までの token 交換を省ける。
 * 各リクエストで毎回 refresh する場合に比べてレイテンシ改善 + 不要なクォータ消費の回避。
 */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // unix ms
}

let cachedToken: CachedToken | null = null;

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export async function getValidDriveAccessToken(db: Database, env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > REFRESH_LEEWAY_MS) {
    return cachedToken.accessToken;
  }
  const refreshToken = await getSecret(db, env, SECRET_KEYS.DRIVE_REFRESH_TOKEN);
  if (!refreshToken) {
    throw new DriveNotConnectedError();
  }
  const tokens = await refreshAccessToken({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    refreshToken,
  });
  cachedToken = {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

export class DriveNotConnectedError extends Error {
  constructor() {
    super('drive not connected');
    this.name = 'DriveNotConnectedError';
  }
}

export class DriveApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`drive api error: ${status} ${body}`);
    this.name = 'DriveApiError';
  }
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

async function driveFetch(
  accessToken: string,
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${DRIVE_API_BASE}${pathAndQuery}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new DriveApiError(res.status, text);
  }
  return res;
}

export interface DriveFolder {
  id: string;
  name: string;
}

interface FilesListResponse<T> {
  files: T[];
  nextPageToken?: string;
}

interface DrivesListResponse {
  drives: Array<{ id: string; name: string }>;
  nextPageToken?: string;
}

/**
 * フロント DriveFolderSelector で使う仮想 parentId。
 * 実 Drive ID と衝突しない接頭辞 (`__`) を持たせる。
 */
export const VIRTUAL_PARENT = {
  /** 共有ドライブ (Shared Drives) のリストに展開 */
  SHARED_DRIVES: '__shared_drives__',
  /** 自分に共有されたフォルダ ("共有アイテム") のリストに展開 */
  SHARED_WITH_ME: '__shared_with_me__',
} as const;

/**
 * 指定 parent 直下のフォルダ一覧を取得する。
 * - parentId='root': admin の My Drive ルート + 末尾に仮想エントリ (共有ドライブ / 共有アイテム)
 * - parentId='__shared_drives__': 共有ドライブの一覧
 * - parentId='__shared_with_me__': 共有アイテムのうちフォルダ
 * - その他: `<id>' in parents` で標準の子フォルダ一覧 (allDrives 対応)
 *
 * 並びは name 昇順。ゴミ箱 (trashed=true) を除外。
 */
export async function listFolderChildren(
  db: Database,
  env: Env,
  parentId: string,
): Promise<DriveFolder[]> {
  const accessToken = await getValidDriveAccessToken(db, env);

  if (parentId === VIRTUAL_PARENT.SHARED_DRIVES) {
    return listSharedDrives(accessToken);
  }
  if (parentId === VIRTUAL_PARENT.SHARED_WITH_ME) {
    return listSharedWithMeFolders(accessToken);
  }

  const folders = await listFoldersInParent(accessToken, parentId);

  // ルートでは末尾に仮想エントリを足して、共有ドライブ / 共有アイテムにも辿れるようにする
  if (parentId === 'root') {
    folders.push(
      { id: VIRTUAL_PARENT.SHARED_DRIVES, name: '共有ドライブ' },
      { id: VIRTUAL_PARENT.SHARED_WITH_ME, name: '共有アイテム' },
    );
  }
  return folders;
}

async function listFoldersInParent(accessToken: string, parentId: string): Promise<DriveFolder[]> {
  const q = [
    `'${escapeQ(parentId)}' in parents`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ].join(' and ');
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name),nextPageToken',
    orderBy: 'name',
    pageSize: '100',
    // 共有ドライブ配下のフォルダも返るよう allDrives モードで叩く
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  });
  return paginatedFilesList(accessToken, params);
}

async function listSharedWithMeFolders(accessToken: string): Promise<DriveFolder[]> {
  const params = new URLSearchParams({
    q: `sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name),nextPageToken',
    orderBy: 'name',
    pageSize: '100',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  return paginatedFilesList(accessToken, params);
}

async function paginatedFilesList(
  accessToken: string,
  params: URLSearchParams,
): Promise<DriveFolder[]> {
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveFetch(accessToken, `/files?${params.toString()}`);
    const json = (await res.json()) as FilesListResponse<DriveFolder>;
    folders.push(...json.files);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return folders;
}

async function listSharedDrives(accessToken: string): Promise<DriveFolder[]> {
  const drives: DriveFolder[] = [];
  let pageToken: string | undefined;
  const params = new URLSearchParams({
    fields: 'drives(id,name),nextPageToken',
    pageSize: '100',
  });
  do {
    if (pageToken) params.set('pageToken', pageToken);
    const res = await driveFetch(accessToken, `/drives?${params.toString()}`);
    const json = (await res.json()) as DrivesListResponse;
    drives.push(...json.drives);
    pageToken = json.nextPageToken;
  } while (pageToken);
  // shared drive そのものを folder のように扱う (id を parents に渡せば中身が取れる)
  return drives;
}

/**
 * 指定フォルダの単体メタを取る (name 確認等)。
 */
export async function getFolderMeta(
  db: Database,
  env: Env,
  folderId: string,
): Promise<DriveFolder> {
  const accessToken = await getValidDriveAccessToken(db, env);
  const res = await driveFetch(
    accessToken,
    `/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType`,
  );
  const json = (await res.json()) as { id: string; name: string; mimeType: string };
  if (json.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error(`not a folder: ${folderId} (mimeType=${json.mimeType})`);
  }
  return { id: json.id, name: json.name };
}

/**
 * Drive クエリ文字列内のシングルクォートをエスケープする。
 * Drive の q 文法ではバックスラッシュエスケープを使う。
 */
function escapeQ(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
