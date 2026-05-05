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

interface SyncLog {
  id: number;
  kind: string;
  status: 'running' | 'success' | 'error';
  startedAt: number;
  finishedAt: number | null;
  fetched: number | null;
  errorsJson: string | null;
}

interface SyncStatusResponse {
  lastLog: SyncLog | null;
  lastAssetLog: SyncLog | null;
  lastSyncedAt: number | null;
  lastAssetSyncedAt: number | null;
  transactionCount: number;
  fileCount: number;
  assetSnapshotCount: number;
}

interface SyncTransactionsResponse {
  ok: true;
  total: number;
  fetched: number;
  skipped: number;
  removed: number;
  errors: Array<{ name: string; message: string }>;
}

interface SyncAssetsResponse {
  ok: true;
  total: number;
  fetched: number;
  skipped: number;
  monthlySnapshots: number;
  errors: Array<{ name: string; message: string }>;
}

interface MigrateBudgetSummary {
  members: number;
  categoryOrder: number;
  annualBudgets: number;
  accountAnchors: number;
  sourceFile: { id: string; name: string; modifiedTime: string };
}

interface MigrateBudgetDryRunResponse {
  ok: true;
  dryRun: true;
  summary: MigrateBudgetSummary;
  alreadyHasData: boolean;
}

interface MigrateBudgetRunResponse {
  ok: true;
  dryRun: false;
  summary: MigrateBudgetSummary;
}

interface MigrateOverridesSummary {
  total: number;
  migrated: number;
  skipped: number;
  ambiguous: number;
  sourceFile: { id: string; name: string; modifiedTime: string } | null;
}

interface MigrateOverridesDryRunResponse {
  ok: true;
  dryRun: true;
  summary: MigrateOverridesSummary;
  alreadyHasData: boolean;
}

interface MigrateOverridesRunResponse {
  ok: true;
  dryRun: false;
  summary: MigrateOverridesSummary;
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
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncAssetsBusy, setSyncAssetsBusy] = useState(false);
  const [migrateBusy, setMigrateBusy] = useState(false);
  const [migrateDryRun, setMigrateDryRun] = useState<MigrateBudgetDryRunResponse | null>(null);
  const [migrateOverridesBusy, setMigrateOverridesBusy] = useState(false);
  const [migrateOverridesDryRun, setMigrateOverridesDryRun] =
    useState<MigrateOverridesDryRunResponse | null>(null);
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

  const reloadSyncStatus = useCallback(async () => {
    const res = await apiGet<SyncStatusResponse>('/api/sync/status');
    if (res.ok) setSyncStatus(res.data);
  }, []);

  useEffect(() => {
    void reloadStatus();
    void reloadSettings();
    void reloadSyncStatus();
  }, [reloadStatus, reloadSettings, reloadSyncStatus]);

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

  const onSyncTransactions = async () => {
    setSyncBusy(true);
    setMessage(null);
    const res = await apiPost<SyncTransactionsResponse>('/api/sync/transactions');
    if (res.ok) {
      const r = res.data;
      const errSummary = r.errors.length > 0 ? ` (${r.errors.length} 件のエラー)` : '';
      setMessage({
        kind: r.errors.length > 0 ? 'error' : 'success',
        text: `同期完了: ${r.fetched} 取込 / ${r.skipped} 変更なし / ${r.removed} 削除${errSummary}`,
      });
      await reloadSyncStatus();
    } else {
      const body = res.error.body as { error?: string } | null;
      const msg =
        body?.error === 'budget_folder_not_set'
          ? '家計簿フォルダが未設定です'
          : body?.error === 'sync_in_progress'
            ? '別の同期が実行中です'
            : body?.error === 'drive_not_connected'
              ? 'Drive 未接続です'
              : '同期に失敗しました';
      setMessage({ kind: 'error', text: msg });
    }
    setSyncBusy(false);
  };

  const onSyncAssets = async () => {
    setSyncAssetsBusy(true);
    setMessage(null);
    const res = await apiPost<SyncAssetsResponse>('/api/sync/assets');
    if (res.ok) {
      const r = res.data;
      const errSummary = r.errors.length > 0 ? ` (${r.errors.length} 件のエラー)` : '';
      setMessage({
        kind: r.errors.length > 0 ? 'error' : 'success',
        text: `資産同期完了: ${r.fetched} ファイル取込 / ${r.skipped} skip / ${r.monthlySnapshots} ヶ月分${errSummary}`,
      });
      await reloadSyncStatus();
    } else {
      const body = res.error.body as { error?: string } | null;
      const msg =
        body?.error === 'asset_folder_not_set'
          ? '資産フォルダが未設定です'
          : body?.error === 'sync_in_progress'
            ? '別の同期が実行中です'
            : body?.error === 'drive_not_connected'
              ? 'Drive 未接続です'
              : '資産同期に失敗しました';
      setMessage({ kind: 'error', text: msg });
    }
    setSyncAssetsBusy(false);
  };

  const onMigrateBudget = async (mode: 'dry-run' | 'run' | 'force') => {
    setMigrateBusy(true);
    setMessage(null);
    const res = await apiFetch<MigrateBudgetDryRunResponse | MigrateBudgetRunResponse>(
      '/api/admin/migrate/budget',
      {
        method: 'POST',
        body: mode === 'dry-run' ? { dryRun: true } : mode === 'force' ? { force: true } : {},
      },
    );
    if (res.ok) {
      if (res.data.dryRun) {
        setMigrateDryRun(res.data);
        setMessage({
          kind: 'success',
          text: `dry-run 完了: メンバー ${res.data.summary.members} 件 / 並び順 ${res.data.summary.categoryOrder} 件 / 年間予算 ${res.data.summary.annualBudgets} 件 / アンカー ${res.data.summary.accountAnchors} 件${res.data.alreadyHasData ? ' (D1 に既存データあり、上書きには「強制実行」が必要)' : ''}`,
        });
      } else {
        setMigrateDryRun(null);
        setMessage({
          kind: 'success',
          text: `移行完了: メンバー ${res.data.summary.members} / 並び順 ${res.data.summary.categoryOrder} / 年間予算 ${res.data.summary.annualBudgets} / アンカー ${res.data.summary.accountAnchors} を D1 に取り込みました`,
        });
        // 移行後は budget hydrate を再実行 (ページリロードで反映される)
        window.location.reload();
      }
    } else {
      const body = res.error.body as { error?: string; detail?: string } | null;
      const msg =
        body?.error === 'budget_folder_not_set'
          ? '家計簿フォルダが未設定です'
          : body?.error === 'budget_json_not_found'
            ? '家計簿フォルダ内に budget.json が見つかりません'
            : body?.error === 'already_migrated'
              ? 'D1 に既存データあり。上書きするには「強制実行」を選択してください'
              : body?.error === 'parse_failed'
                ? `budget.json のパースに失敗: ${body.detail ?? ''}`
                : '移行に失敗しました';
      setMessage({ kind: 'error', text: msg });
    }
    setMigrateBusy(false);
  };

  const onMigrateOverrides = async (mode: 'dry-run' | 'run' | 'force') => {
    setMigrateOverridesBusy(true);
    setMessage(null);
    const res = await apiFetch<MigrateOverridesDryRunResponse | MigrateOverridesRunResponse>(
      '/api/admin/migrate/overrides',
      {
        method: 'POST',
        body: mode === 'dry-run' ? { dryRun: true } : mode === 'force' ? { force: true } : {},
      },
    );
    if (res.ok) {
      const s = res.data.summary;
      if (res.data.dryRun) {
        setMigrateOverridesDryRun(res.data);
        const ambiguousNote = s.ambiguous > 0 ? ` (重複 ${s.ambiguous} 件は最新ファイル採用)` : '';
        setMessage({
          kind: 'success',
          text: `dry-run 完了: 移行候補 ${s.total} 件${ambiguousNote}${res.data.alreadyHasData ? ' (D1 に既存 override あり、上書きには「強制実行」が必要)' : ''}`,
        });
      } else {
        setMigrateOverridesDryRun(null);
        const ambiguousNote = s.ambiguous > 0 ? ` (重複 ${s.ambiguous})` : '';
        setMessage({
          kind: 'success',
          text: `override 移行完了: ${s.migrated} 件取込 / ${s.skipped} 件 skip${ambiguousNote}`,
        });
      }
    } else {
      const body = res.error.body as { error?: string; detail?: string } | null;
      const msg =
        body?.error === 'budget_folder_not_set'
          ? '家計簿フォルダが未設定です'
          : body?.error === 'already_migrated'
            ? 'D1 に既存の override あり。上書きするには「強制実行」を選択してください'
            : body?.error === 'parse_failed'
              ? `overrides.json のパースに失敗: ${body.detail ?? ''}`
              : body?.error === 'drive_not_connected'
                ? 'Drive 未接続です'
                : '移行に失敗しました';
      setMessage({ kind: 'error', text: msg });
    }
    setMigrateOverridesBusy(false);
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

          <div className="space-y-2 pt-3 border-t border-line">
            <div className="text-xs font-medium tracking-wider text-ink-70">
              旧 budget.json から D1 へ移行
            </div>
            <div className="text-[11px] text-ink-40 leading-relaxed">
              旧 frontend Drive Picker 経路で作った budget.json (メンバー / 年間予算 /
              カテゴリ並び順 / アンカー) を D1 に取り込みます。家計簿フォルダ直下の budget.json
              を読みます。dry-run は読むだけ、run は D1 に保存します。
            </div>
            {migrateDryRun && (
              <div className="text-[11px] text-ink-60 bg-canvas px-2 py-1.5 rounded border border-line">
                プレビュー: メンバー {migrateDryRun.summary.members} / 並び順{' '}
                {migrateDryRun.summary.categoryOrder} / 年間予算{' '}
                {migrateDryRun.summary.annualBudgets} / アンカー{' '}
                {migrateDryRun.summary.accountAnchors}
                {migrateDryRun.alreadyHasData && (
                  <span className="text-rose-700"> · D1 に既存データあり</span>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onMigrateBudget('dry-run')}
                disabled={migrateBusy || !budgetFolderId}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-line hover:bg-canvas disabled:opacity-50"
              >
                {migrateBusy ? '実行中…' : 'プレビュー (dry-run)'}
              </button>
              <button
                type="button"
                onClick={() => void onMigrateBudget('run')}
                disabled={migrateBusy || !budgetFolderId}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
              >
                取り込み実行
              </button>
              {migrateDryRun?.alreadyHasData && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'D1 の既存データを budget.json で上書きします。よろしいですか？',
                      )
                    ) {
                      void onMigrateBudget('force');
                    }
                  }}
                  disabled={migrateBusy}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-rose-700 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  強制実行
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-line">
            <div className="text-xs font-medium tracking-wider text-ink-70">
              旧 overrides.json から D1 へ移行
            </div>
            <div className="text-[11px] text-ink-40 leading-relaxed">
              旧 frontend Drive 経路で書いていた取引上書き (overrides.json) を D1 に取り込みます。
              家計簿フォルダ直下の overrides.json を読みます。事前に取引同期を済ませておくこと
              (mfRowId → sourceFileId の解決に使います)。
            </div>
            {migrateOverridesDryRun && (
              <div className="text-[11px] text-ink-60 bg-canvas px-2 py-1.5 rounded border border-line">
                プレビュー: 移行候補 {migrateOverridesDryRun.summary.total} 件
                {migrateOverridesDryRun.summary.ambiguous > 0 && (
                  <> · 重複 {migrateOverridesDryRun.summary.ambiguous} 件 (最新採用)</>
                )}
                {migrateOverridesDryRun.alreadyHasData && (
                  <span className="text-rose-700"> · D1 に既存 override あり</span>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void onMigrateOverrides('dry-run')}
                disabled={migrateOverridesBusy || !budgetFolderId}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-line hover:bg-canvas disabled:opacity-50"
              >
                {migrateOverridesBusy ? '実行中…' : 'プレビュー (dry-run)'}
              </button>
              <button
                type="button"
                onClick={() => void onMigrateOverrides('run')}
                disabled={migrateOverridesBusy || !budgetFolderId}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
              >
                取り込み実行
              </button>
              {migrateOverridesDryRun?.alreadyHasData && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'D1 の既存 override を overrides.json で上書きします。よろしいですか？',
                      )
                    ) {
                      void onMigrateOverrides('force');
                    }
                  }}
                  disabled={migrateOverridesBusy}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-rose-700 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  強制実行
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-line">
            <div className="text-xs font-medium tracking-wider text-ink-70">
              取引データ同期 (サーバ側)
            </div>
            <div className="text-[11px] text-ink-40 leading-relaxed">
              家計簿フォルダ内の CSV を Worker から読んで D1
              に取り込みます。家族全員が同じデータを見られます。
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-ink-60 tabular-nums leading-relaxed">
                {syncStatus ? (
                  <>
                    最終同期:{' '}
                    {syncStatus.lastSyncedAt
                      ? new Date(syncStatus.lastSyncedAt).toLocaleString('ja-JP')
                      : '未同期'}
                    <br />
                    取引: {syncStatus.transactionCount} 件 / ファイル: {syncStatus.fileCount} 件
                  </>
                ) : (
                  '読み込み中…'
                )}
              </div>
              <button
                type="button"
                onClick={() => void onSyncTransactions()}
                disabled={syncBusy || !budgetFolderId}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
              >
                {syncBusy ? '同期中…' : !budgetFolderId ? 'フォルダ未設定' : 'Drive から取り込み'}
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-line">
            <div className="text-xs font-medium tracking-wider text-ink-70">
              資産データ同期 (サーバ側)
            </div>
            <div className="text-[11px] text-ink-40 leading-relaxed">
              資産フォルダ内の資産推移 CSV を取り込んで月末スナップショットとして D1
              に全置換で保存します。Dashboard の総資産 KPI に使われます。
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-ink-60 tabular-nums leading-relaxed">
                {syncStatus ? (
                  <>
                    最終同期:{' '}
                    {syncStatus.lastAssetSyncedAt
                      ? new Date(syncStatus.lastAssetSyncedAt).toLocaleString('ja-JP')
                      : '未同期'}
                    <br />
                    スナップショット: {syncStatus.assetSnapshotCount} ヶ月分
                  </>
                ) : (
                  '読み込み中…'
                )}
              </div>
              <button
                type="button"
                onClick={() => void onSyncAssets()}
                disabled={syncAssetsBusy || !assetFolderId}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 disabled:opacity-50"
              >
                {syncAssetsBusy
                  ? '同期中…'
                  : !assetFolderId
                    ? 'フォルダ未設定'
                    : 'Drive から取り込み'}
              </button>
            </div>
          </div>
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
