import { useEffect, useState, useCallback } from 'react';
import { apiGet } from '@/lib/api';

interface DriveFolder {
  id: string;
  name: string;
}

interface FoldersResponse {
  folders: DriveFolder[];
}

interface BreadcrumbEntry {
  /** Drive folder id ('root' は My Drive ルート) */
  id: string;
  /** 表示用名前 ('root' のときは "マイドライブ") */
  name: string;
}

interface DriveFolderSelectorProps {
  /** モーダル表示中かどうか */
  open: boolean;
  /** モーダルを閉じる (ユーザがキャンセル) */
  onClose: () => void;
  /** フォルダが選ばれた時のコールバック (id, name の両方を返す) */
  onSelect: (folder: { id: string; name: string }) => void;
  /** モーダルのタイトル (用途に応じて変える: 「家計簿フォルダを選択」など) */
  title: string;
}

const ROOT_BREADCRUMB: BreadcrumbEntry = { id: 'root', name: 'マイドライブ' };

export default function DriveFolderSelector({
  open,
  onClose,
  onSelect,
  title,
}: DriveFolderSelectorProps) {
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([ROOT_BREADCRUMB]);
  const [children, setChildren] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = breadcrumb[breadcrumb.length - 1]!;

  const loadChildren = useCallback(async (parentId: string) => {
    setLoading(true);
    setError(null);
    const res = await apiGet<FoldersResponse>(
      `/api/admin/drive/folders?parentId=${encodeURIComponent(parentId)}`,
    );
    setLoading(false);
    if (res.ok) {
      setChildren(res.data.folders);
    } else {
      const body = res.error.body as { error?: string } | null;
      if (body?.error === 'drive_not_connected') {
        setError('Drive が未接続です。先に接続してください');
      } else {
        setError('フォルダ一覧の取得に失敗しました');
      }
      setChildren([]);
    }
  }, []);

  // モーダル open / breadcrumb 変化時に現在フォルダの子を取得
  useEffect(() => {
    if (!open) return;
    void loadChildren(currentFolder.id);
  }, [open, currentFolder.id, loadChildren]);

  // open し直すたびにルートに戻す
  useEffect(() => {
    if (open) {
      setBreadcrumb([ROOT_BREADCRUMB]);
    }
  }, [open]);

  if (!open) return null;

  const enterFolder = (folder: DriveFolder) => {
    setBreadcrumb([...breadcrumb, { id: folder.id, name: folder.name }]);
  };

  const goToBreadcrumb = (idx: number) => {
    setBreadcrumb(breadcrumb.slice(0, idx + 1));
  };

  const useThisFolder = () => {
    if (currentFolder.id === 'root') {
      // ルート自体は CSV 置き場として通常 NG なので警告。技術的には選べる。
      if (!window.confirm('マイドライブのルートを選択しますか？ 通常はサブフォルダを選びます')) {
        return;
      }
    }
    onSelect({ id: currentFolder.id, name: currentFolder.name });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="card max-w-md w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-line">
          <h3 className="text-sm font-semibold">{title}</h3>
        </header>

        <div className="px-5 py-3 border-b border-line text-[11px] flex items-center gap-1 flex-wrap">
          {breadcrumb.map((b, i) => (
            <div key={`${b.id}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span className="text-ink-40">/</span>}
              {i < breadcrumb.length - 1 ? (
                <button
                  type="button"
                  onClick={() => goToBreadcrumb(i)}
                  className="text-ink-60 hover:text-ink underline-offset-2 hover:underline"
                >
                  {b.name}
                </button>
              ) : (
                <span className="font-medium">{b.name}</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[200px]">
          {loading ? (
            <div className="text-xs text-ink-40 p-4">読み込み中…</div>
          ) : error ? (
            <div className="text-xs text-red-700 p-4">{error}</div>
          ) : children.length === 0 ? (
            <div className="text-xs text-ink-40 p-4">サブフォルダはありません</div>
          ) : (
            <ul className="space-y-0.5">
              {children.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => enterFolder(f)}
                    className="w-full text-left text-sm px-3 py-2 rounded hover:bg-canvas flex items-center gap-2"
                  >
                    <span className="text-ink-40">📁</span>
                    <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-line flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-line hover:bg-canvas"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={useThisFolder}
            disabled={loading || error !== null}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
          >
            「{currentFolder.name}」を使う
          </button>
        </footer>
      </div>
    </div>
  );
}
