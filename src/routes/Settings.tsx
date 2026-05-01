import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import FolderPickerButton from '@/components/FolderPickerButton';
import DiagnosticsPanel from '@/components/DiagnosticsPanel';
import CategoryOrderEditor from '@/components/CategoryOrderEditor';
import MemberEditor from '@/components/MemberEditor';
import AccountAnchorEditor from '@/components/AccountAnchorEditor';
import { useAuthStore } from '@/store/auth';
import { useFolderStore } from '@/store/folder';
import { useSyncStore } from '@/store/sync';
import { clearAllData, db } from '@/lib/db';

export default function Settings() {
  const folder = useFolderStore((s) => s.folder);
  const clearFolder = useFolderStore((s) => s.clearFolder);
  const assetFolder = useFolderStore((s) => s.assetFolder);
  const clearAssetFolder = useFolderStore((s) => s.clearAssetFolder);
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  const hydrateSync = useSyncStore((s) => s.hydrate);

  const txCount = useLiveQuery(() => db.transactions.count(), [], 0);
  const fileCount = useLiveQuery(() => db.files.count(), [], 0);
  const assetMonthCount = useLiveQuery(() => db.assetSnapshots.count(), [], 0);

  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function onReset() {
    setBusy(true);
    try {
      await clearAllData();
      hydrateSync(null);
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-xl font-semibold">設定</h1>
        <p className="text-sm text-ink-60 mt-1">Driveフォルダ・アカウント・キャッシュ管理。</p>
      </header>

      <section className="card p-6 space-y-3">
        <h2 className="text-sm font-semibold tracking-wider text-ink-70">家計簿フォルダ</h2>
        <p className="text-xs text-ink-60">
          マネーフォワードME の取引CSVを置いている Drive フォルダです。
        </p>
        {folder ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium">{folder.name}</div>
              <div className="text-[11px] text-ink-40 break-all">{folder.id}</div>
            </div>
            <div className="flex items-center gap-3">
              <FolderPickerButton label="選び直す" />
              <button
                type="button"
                onClick={() => clearFolder()}
                className="text-xs text-ink-60 hover:text-ink underline-offset-2 hover:underline"
              >
                フォルダ設定を解除
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-60">まだフォルダが選ばれていません。</p>
            <FolderPickerButton />
          </div>
        )}
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-sm font-semibold tracking-wider text-ink-70">資産フォルダ（任意）</h2>
        <p className="text-xs text-ink-60">
          資産推移CSV（マネーフォワードの「資産推移」エクスポート相当）を置いている Drive
          フォルダ。設定するとダッシュボードに「総資産」「前月比」を表示します。
          {assetMonthCount > 0 && (
            <span className="text-ink-40">
              {' '}
              現在 {assetMonthCount} ヶ月分のスナップショットが取り込まれています。
            </span>
          )}
        </p>
        {assetFolder ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium">{assetFolder.name}</div>
              <div className="text-[11px] text-ink-40 break-all">{assetFolder.id}</div>
            </div>
            <div className="flex items-center gap-3">
              <FolderPickerButton label="選び直す" target="asset" />
              <button
                type="button"
                onClick={() => clearAssetFolder()}
                className="text-xs text-ink-60 hover:text-ink underline-offset-2 hover:underline"
              >
                フォルダ設定を解除
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-60">まだフォルダが選ばれていません。</p>
            <FolderPickerButton target="asset" label="資産フォルダを選択" />
          </div>
        )}
      </section>

      <section className="card p-6 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-ink-70">ローカルキャッシュ</h2>
            <p className="text-xs text-ink-60 mt-1 tabular-nums">
              ファイル {fileCount} 件 / 取引 {txCount} 件
            </p>
          </div>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-xs text-ink-60 hover:text-red-700 underline-offset-2 hover:underline"
            >
              キャッシュをリセット
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void onReset()}
                disabled={busy}
                className="text-xs font-medium text-red-700 border border-red-700/40 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50"
              >
                {busy ? '削除中…' : '本当に削除する'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="text-xs text-ink-60 hover:text-ink"
              >
                キャンセル
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-ink-40 leading-relaxed">
          IndexedDB 上のキャッシュのみ削除します。Drive
          上のCSV・予算設定は影響を受けません。次回同期で再取得されます。
        </p>
      </section>

      <section className="card p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-ink-70">メンバー</h2>
          <p className="text-xs text-ink-60 mt-1">
            家族のメンバーと、各メンバーが使う金融機関の対応を設定します。
            ここで紐付けた口座の取引は、取引一覧やレポートでメンバー別に集計できます。
          </p>
        </div>
        <MemberEditor />
      </section>

      <section className="card p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-ink-70">口座別残高アンカー</h2>
          <p className="text-xs text-ink-60 mt-1">
            特定の機関の残高をある日付の値で「アンカー」として固定すると、取引データの
            収支を遡って各月末の推定残高を算出します。ダッシュボードに当月末の推定残高が
            表示されます。
          </p>
        </div>
        <AccountAnchorEditor />
      </section>

      <section className="card p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-ink-70">カテゴリ並び順</h2>
          <p className="text-xs text-ink-60 mt-1">
            予算画面・ダッシュボードで使われるカテゴリの並び順を固定します。 ↑↓
            で並び替えて「保存」を押すと <code>budget.json</code> に書き戻されます。
          </p>
        </div>
        <CategoryOrderEditor />
      </section>

      <section className="card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-ink-70">データ診断</h2>
          <p className="text-xs text-ink-60 mt-1">
            月別の取り込み内訳と、集計に入っていない正の取引を表示します。
            「集計収入」が0なのに「+件」がある月は要調査です。
          </p>
        </div>
        <DiagnosticsPanel />
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="text-sm font-semibold tracking-wider text-ink-70">アカウント</h2>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm">{email ?? '未ログイン'}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center justify-center text-xs font-medium px-3 py-1.5 rounded-md border border-line hover:bg-canvas"
          >
            ログアウト
          </button>
        </div>
      </section>
    </div>
  );
}
