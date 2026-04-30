// Google Drive API v3 を fetch で直叩きする最小ラッパ。
// 認証は Bearer アクセストークン（Zustand auth store の値を渡す前提）。

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  md5Checksum?: string;
}

interface ListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

interface ListOptions {
  /** 末尾 .csv のファイルだけ取りたいなら true（既定）。MFは text/csv で返るがブラウザ判定不安定なため拡張子フィルタ併用 */
  csvOnly?: boolean;
  pageSize?: number;
  pageToken?: string;
}

export async function listFolderChildren(
  accessToken: string,
  folderId: string,
  opts: ListOptions = {},
): Promise<ListResponse> {
  const csvOnly = opts.csvOnly ?? true;
  const conditions = [`'${folderId}' in parents`, 'trashed=false'];
  if (csvOnly) {
    // mimeType が text/csv のもの、または .csv で終わる名前のもの
    conditions.push("(mimeType='text/csv' or name contains '.csv')");
  }
  const params = new URLSearchParams({
    q: conditions.join(' and '),
    fields: 'files(id,name,mimeType,modifiedTime,size,md5Checksum),nextPageToken',
    pageSize: String(opts.pageSize ?? 1000),
    orderBy: 'name desc',
  });
  if (opts.pageToken) params.set('pageToken', opts.pageToken);

  const res = await fetch(`${DRIVE_FILES}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`drive.files.list ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as ListResponse;
}

export async function listAllFolderChildren(
  accessToken: string,
  folderId: string,
  opts: Omit<ListOptions, 'pageToken'> = {},
): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listFolderChildren(accessToken, folderId, { ...opts, pageToken });
    all.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return all;
}

export async function downloadFileBytes(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`${DRIVE_FILES}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`drive download ${res.status}: ${body || res.statusText}`);
  }
  return res.arrayBuffer();
}

export async function getFileMetadata(
  accessToken: string,
  fileId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime,size,md5Checksum',
  });
  const res = await fetch(`${DRIVE_FILES}/${fileId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`drive.files.get ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as DriveFile;
}
