// Drive 上に置く JSON 設定ファイル（budget.json / overrides.json）の汎用 R/W。
// drive.file スコープで作成 → 以降 drive.file で読み書き可能。
// 既存の同名ファイルが drive.readonly で見えるが drive.file では書けない可能性があるため、
// アプリが新規作成したファイルのみを安定運用する想定。

const UPLOAD_FILES = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES = 'https://www.googleapis.com/drive/v3/files';

export interface ConfigFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
}

export async function findConfigFile(
  accessToken: string,
  folderId: string,
  name: string,
): Promise<ConfigFileMeta | null> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and name='${name}' and trashed=false`,
    fields: 'files(id,name,modifiedTime)',
  });
  const res = await fetch(`${FILES}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`drive.files.list ${res.status}: ${body || res.statusText}`);
  }
  const data = (await res.json()) as { files?: ConfigFileMeta[] };
  return data.files?.[0] ?? null;
}

export async function readJsonFile<T>(
  accessToken: string,
  fileId: string,
): Promise<T> {
  const res = await fetch(`${FILES}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`drive read ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getFileMeta(
  accessToken: string,
  fileId: string,
): Promise<ConfigFileMeta> {
  const params = new URLSearchParams({ fields: 'id,name,modifiedTime' });
  const res = await fetch(`${FILES}/${fileId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`drive.files.get ${res.status}`);
  }
  return (await res.json()) as ConfigFileMeta;
}

export async function createJsonFile<T>(
  accessToken: string,
  folderId: string,
  name: string,
  content: T,
): Promise<ConfigFileMeta> {
  const metadata = {
    name,
    parents: [folderId],
    mimeType: 'application/json',
  };
  const boundary = `bdy${Math.random().toString(36).slice(2)}`;
  const body = JSON.stringify(content, null, 2);
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    body +
    `\r\n` +
    `--${boundary}--`;
  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,name,modifiedTime',
  });
  const res = await fetch(`${UPLOAD_FILES}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`drive create ${res.status}: ${errBody || res.statusText}`);
  }
  return (await res.json()) as ConfigFileMeta;
}

export async function updateJsonFile<T>(
  accessToken: string,
  fileId: string,
  content: T,
): Promise<ConfigFileMeta> {
  const params = new URLSearchParams({
    uploadType: 'media',
    fields: 'id,name,modifiedTime',
  });
  const res = await fetch(`${UPLOAD_FILES}/${fileId}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(content, null, 2),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`drive update ${res.status}: ${errBody || res.statusText}`);
  }
  return (await res.json()) as ConfigFileMeta;
}
