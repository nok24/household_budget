import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiFetch } from '@/lib/api';

interface DriveStatusResponse {
  connected: boolean;
}

interface SettingsResponse {
  settings: Record<string, string>;
}

interface ConnectResponse {
  authUrl: string;
}

const SETTING_KEYS = {
  BUDGET_FOLDER_ID: 'budget_folder_id',
  ASSET_FOLDER_ID: 'asset_folder_id',
} as const;

const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'state 不一致 (CSRF 防御)。もう一度接続を試してください',
  no_refresh_token:
    'Google が refresh token を返却しませんでした。Google アカウントの「アプリのアクセス」から旧アクセスを取り消してから再試行してください',
  exchange_failed: 'token 交換に失敗しました。GOOGLE_CLIENT_SECRET の設定を確認してください',
  access_denied: '同意がキャンセルされました',
};

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [budgetFolderId, setBudgetFolderId] = useState('');
  const [assetFolderId, setAssetFolderId] = useState('');
  const [savedBudgetFolderId, setSavedBudgetFolderId] = useState('');
  const [savedAssetFolderId, setSavedAssetFolderId] = useState('');
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
      setAssetFolderId(s[SETTING_KEYS.ASSET_FOLDER_ID] ?? '');
      setSavedBudgetFolderId(s[SETTING_KEYS.BUDGET_FOLDER_ID] ?? '');
      setSavedAssetFolderId(s[SETTING_KEYS.ASSET_FOLDER_ID] ?? '');
    }
  }, []);

  // 初回ロード
  useEffect(() => {
    void reloadStatus();
    void reloadSettings();
  }, [reloadStatus, reloadSettings]);

  // callback リダイレクト後のメッセージ表示 + URL クリーンアップ
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
      // 戻ってこない (Google にリダイレクト)
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

  const onSaveSettings = async () => {
    setSettingsBusy(true);
    setMessage(null);
    const res = await apiFetch<SettingsResponse>('/api/admin/settings', {
      method: 'PUT',
      body: {
        [SETTING_KEYS.BUDGET_FOLDER_ID]: budgetFolderId.trim(),
        [SETTING_KEYS.ASSET_FOLDER_ID]: assetFolderId.trim(),
      },
    });
    if (res.ok) {
      setSavedBudgetFolderId(res.data.settings[SETTING_KEYS.BUDGET_FOLDER_ID] ?? '');
      setSavedAssetFolderId(res.data.settings[SETTING_KEYS.ASSET_FOLDER_ID] ?? '');
      setMessage({ kind: 'success', text: 'フォルダ ID を保存しました' });
    } else {
      setMessage({ kind: 'error', text: '保存に失敗しました' });
    }
    setSettingsBusy(false);
  };

  const settingsDirty =
    budgetFolderId.trim() !== savedBudgetFolderId || assetFolderId.trim() !== savedAssetFolderId;

  return (
    <section className="card p-6 space-y-5 border-accent/30">
      <div>
        <h2 className="text-sm font-semibold tracking-wider text-ink-70">
          管理者: サーバ Drive 接続
        </h2>
        <p className="text-xs text-ink-60 mt-1">
          Worker から Drive の CSV を読むための接続。1
          アカウントだけ繋げば家族全員が同じデータを共有できます。Phase 3 までは旧フォルダ Picker
          と並存します。
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

      <div className="space-y-3 pt-3 border-t border-line">
        <div className="text-xs font-medium tracking-wider text-ink-70">サーバ側フォルダ ID</div>
        <p className="text-[11px] text-ink-40 leading-relaxed">
          Drive で対象フォルダを開いた URL の <code>/folders/XXXXXX</code> 部分を貼り付けます。
          Phase 3 で Worker 側の同期 API がこの値を使います。
        </p>

        <label className="block space-y-1">
          <span className="text-xs text-ink-60">家計簿 (取引 CSV) フォルダ ID</span>
          <input
            type="text"
            value={budgetFolderId}
            onChange={(e) => setBudgetFolderId(e.target.value)}
            placeholder="1ABCdef…"
            className="w-full text-sm font-numeric px-3 py-2 rounded border border-line focus:outline-none focus:border-accent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-ink-60">資産 CSV フォルダ ID (任意)</span>
          <input
            type="text"
            value={assetFolderId}
            onChange={(e) => setAssetFolderId(e.target.value)}
            placeholder="1ABCdef…"
            className="w-full text-sm font-numeric px-3 py-2 rounded border border-line focus:outline-none focus:border-accent"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onSaveSettings()}
            disabled={!settingsDirty || settingsBusy}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
          >
            {settingsBusy ? '保存中…' : '保存'}
          </button>
          {settingsDirty && !settingsBusy && (
            <span className="text-[11px] text-ink-40">未保存の変更があります</span>
          )}
        </div>
      </div>
    </section>
  );
}
