import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, apiGet, apiPost } from '@/lib/api';
import DriveFolderSelector from './DriveFolderSelector';

interface DriveStatusResponse {
  connected: boolean;
}

interface ConnectResponse {
  authUrl: string;
}

interface SettingsResponse {
  settings: Record<string, string>;
}

const SETTING_KEYS = {
  BUDGET_FOLDER_ID: 'budget_folder_id',
  BUDGET_FOLDER_NAME: 'budget_folder_name',
  ASSET_FOLDER_ID: 'asset_folder_id',
  ASSET_FOLDER_NAME: 'asset_folder_name',
} as const;

const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'state 不一致 (CSRF 防御)。もう一度接続を試してください',
  no_refresh_token:
    'Google が refresh token を返却しませんでした。Google アカウントの「アプリのアクセス」から旧アクセスを取り消してから再試行してください',
  exchange_failed: 'token 交換に失敗しました。GOOGLE_CLIENT_SECRET の設定を確認してください',
  access_denied: '同意がキャンセルされました',
};

type FolderKind = 'budget' | 'asset';

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [budgetFolderId, setBudgetFolderId] = useState<string>('');
  const [budgetFolderName, setBudgetFolderName] = useState<string>('');
  const [assetFolderId, setAssetFolderId] = useState<string>('');
  const [assetFolderName, setAssetFolderName] = useState<string>('');
  const [selectorOpen, setSelectorOpen] = useState<FolderKind | null>(null);
  const [savingFolder, setSavingFolder] = useState<FolderKind | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const driveQuery = searchParams.get('drive');
  const driveErrorQuery = searchParams.get('drive_error');

  const reloadStatus = useCallback(async () => {
    setStatusBusy(true);
    const res = await apiGet<DriveStatusResponse>('/api/admin/drive/status');
    if (res.ok) setConnected(res.data.connected);
    setStatusBusy(false);
  }, []);

  const reloadSettings = useCallback(async () => {
    const res = await apiGet<SettingsResponse>('/api/admin/settings');
    if (res.ok) {
      const s = res.data.settings;
      setBudgetFolderId(s[SETTING_KEYS.BUDGET_FOLDER_ID] ?? '');
      setBudgetFolderName(s[SETTING_KEYS.BUDGET_FOLDER_NAME] ?? '');
      setAssetFolderId(s[SETTING_KEYS.ASSET_FOLDER_ID] ?? '');
      setAssetFolderName(s[SETTING_KEYS.ASSET_FOLDER_NAME] ?? '');
    }
  }, []);

  useEffect(() => {
    void reloadStatus();
    void reloadSettings();
  }, [reloadStatus, reloadSettings]);

  useEffect(() => {
    if (driveQuery === 'connected') {
      setMessage({ kind: 'success', text: 'Drive を接続しました' });
      void reloadStatus();
      const next = new URLSearchParams(searchParams);
      next.delete('drive');
      setSearchParams(next, { replace: true });
    } else if (driveErrorQuery) {
      setMessage({
        kind: 'error',
        text: DRIVE_ERROR_MESSAGES[driveErrorQuery] ?? `Drive 接続に失敗: ${driveErrorQuery}`,
      });
      const next = new URLSearchParams(searchParams);
      next.delete('drive_error');
      setSearchParams(next, { replace: true });
    }
  }, [driveQuery, driveErrorQuery, searchParams, setSearchParams, reloadStatus]);

  const onConnect = async () => {
    setConnectBusy(true);
    setMessage(null);
    const res = await apiPost<ConnectResponse>('/api/admin/drive/connect');
    if (res.ok) {
      window.location.href = res.data.authUrl;
    } else {
      setMessage({ kind: 'error', text: '接続開始に失敗しました' });
      setConnectBusy(false);
    }
  };

  const onDisconnect = async () => {
    if (!window.confirm('Drive 接続を解除しますか？ refresh token が削除されます。')) return;
    setDisconnectBusy(true);
    setMessage(null);
    const res = await apiPost('/api/admin/drive/disconnect');
    if (res.ok) {
      setMessage({ kind: 'success', text: 'Drive 接続を解除しました' });
      await reloadStatus();
    } else {
      setMessage({ kind: 'error', text: '解除に失敗しました' });
    }
    setDisconnectBusy(false);
  };

  const onFolderSelected = async (kind: FolderKind, folder: { id: string; name: string }) => {
    setSelectorOpen(null);
    setSavingFolder(kind);
    setMessage(null);
    const idKey = kind === 'budget' ? SETTING_KEYS.BUDGET_FOLDER_ID : SETTING_KEYS.ASSET_FOLDER_ID;
    const nameKey =
      kind === 'budget' ? SETTING_KEYS.BUDGET_FOLDER_NAME : SETTING_KEYS.ASSET_FOLDER_NAME;
    const res = await apiFetch<SettingsResponse>('/api/admin/settings', {
      method: 'PUT',
      body: { [idKey]: folder.id, [nameKey]: folder.name },
    });
    if (res.ok) {
      const s = res.data.settings;
      setBudgetFolderId(s[SETTING_KEYS.BUDGET_FOLDER_ID] ?? '');
      setBudgetFolderName(s[SETTING_KEYS.BUDGET_FOLDER_NAME] ?? '');
      setAssetFolderId(s[SETTING_KEYS.ASSET_FOLDER_ID] ?? '');
      setAssetFolderName(s[SETTING_KEYS.ASSET_FOLDER_NAME] ?? '');
      setMessage({
        kind: 'success',
        text: `${kind === 'budget' ? '家計簿' : '資産'}フォルダを保存しました`,
      });
    } else {
      setMessage({ kind: 'error', text: '保存に失敗しました' });
    }
    setSavingFolder(null);
  };

  const onClearFolder = async (kind: FolderKind) => {
    if (!window.confirm(`${kind === 'budget' ? '家計簿' : '資産'}フォルダの設定を解除しますか？`)) {
      return;
    }
    setSavingFolder(kind);
    setMessage(null);
    const idKey = kind === 'budget' ? SETTING_KEYS.BUDGET_FOLDER_ID : SETTING_KEYS.ASSET_FOLDER_ID;
    const nameKey =
      kind === 'budget' ? SETTING_KEYS.BUDGET_FOLDER_NAME : SETTING_KEYS.ASSET_FOLDER_NAME;
    const res = await apiFetch<SettingsResponse>('/api/admin/settings', {
      method: 'PUT',
      body: { [idKey]: '', [nameKey]: '' },
    });
    if (res.ok) {
      await reloadSettings();
      setMessage({ kind: 'success', text: 'フォルダ設定を解除しました' });
    } else {
      setMessage({ kind: 'error', text: '解除に失敗しました' });
    }
    setSavingFolder(null);
  };

  return (
    <section className="card p-6 space-y-5 border-accent/30">
      <div>
        <h2 className="text-sm font-semibold tracking-wider text-ink-70">
          管理者: サーバ Drive 接続
        </h2>
        <p className="text-xs text-ink-60 mt-1">
          Worker から Drive の CSV を読むための接続。1
          アカウントだけ繋げば家族全員が同じデータを共有できます。
        </p>
      </div>

      {message && (
        <div
          className={`text-xs px-3 py-2 rounded ${
            message.kind === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium tracking-wider text-ink-70">接続状態</div>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            {statusBusy
              ? '読み込み中…'
              : connected === null
                ? '未取得'
                : connected
                  ? '✅ 接続済み'
                  : '⚪️ 未接続'}
          </span>
          {connected ? (
            <button
              type="button"
              onClick={() => void onDisconnect()}
              disabled={disconnectBusy}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-line hover:bg-canvas disabled:opacity-50"
            >
              {disconnectBusy ? '解除中…' : '接続を解除'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onConnect()}
              disabled={connectBusy}
              className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
            >
              {connectBusy ? '接続中…' : 'Drive を接続'}
            </button>
          )}
        </div>
      </div>

      {connected && (
        <>
          <FolderRow
            label="家計簿 (取引 CSV) フォルダ"
            folderName={budgetFolderName}
            folderId={budgetFolderId}
            onChange={() => setSelectorOpen('budget')}
            onClear={() => void onClearFolder('budget')}
            busy={savingFolder === 'budget'}
          />
          <FolderRow
            label="資産推移 CSV フォルダ"
            folderName={assetFolderName}
            folderId={assetFolderId}
            onChange={() => setSelectorOpen('asset')}
            onClear={() => void onClearFolder('asset')}
            busy={savingFolder === 'asset'}
          />
        </>
      )}

      <DriveFolderSelector
        open={selectorOpen !== null}
        onClose={() => setSelectorOpen(null)}
        onSelect={(folder) => {
          if (selectorOpen) void onFolderSelected(selectorOpen, folder);
        }}
        title={
          selectorOpen === 'budget'
            ? '家計簿フォルダを選択'
            : selectorOpen === 'asset'
              ? '資産フォルダを選択'
              : ''
        }
      />
    </section>
  );
}

interface FolderRowProps {
  label: string;
  folderName: string;
  folderId: string;
  onChange: () => void;
  onClear: () => void;
  busy: boolean;
}

function FolderRow({ label, folderName, folderId, onChange, onClear, busy }: FolderRowProps) {
  return (
    <div className="space-y-2 pt-3 border-t border-line">
      <div className="text-xs font-medium tracking-wider text-ink-70">{label}</div>
      {folderId ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{folderName || '(名前未取得)'}</div>
            <div className="text-[11px] text-ink-40 break-all">{folderId}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onChange}
              disabled={busy}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-line hover:bg-canvas disabled:opacity-50"
            >
              変更
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              className="text-xs text-ink-60 hover:text-ink underline-offset-2 hover:underline disabled:opacity-50"
            >
              解除
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-40">未設定</span>
          <button
            type="button"
            onClick={onChange}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '保存中…' : 'フォルダを選択'}
          </button>
        </div>
      )}
    </div>
  );
}
