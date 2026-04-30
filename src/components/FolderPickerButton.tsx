import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useFolderStore } from '@/store/folder';
import { pickFolder } from '@/lib/picker';

const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

interface Props {
  className?: string;
  label?: string;
}

export default function FolderPickerButton({ className, label }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);
  const setFolder = useFolderStore((s) => s.setFolder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setBusy(true);
    try {
      const token = (await ensureFreshToken()) ?? accessToken;
      if (!token) throw new Error('アクセストークンがありません。再ログインしてください');
      if (!API_KEY) throw new Error('VITE_GOOGLE_API_KEY が設定されていません');
      const picked = await pickFolder({ accessToken: token, apiKey: API_KEY });
      if (picked) {
        setFolder(picked);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        className="inline-flex items-center justify-center bg-accent text-white text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {busy ? '選択中…' : (label ?? 'フォルダを選択')}
      </button>
      {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
    </div>
  );
}
