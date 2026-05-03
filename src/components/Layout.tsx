import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useBudgetStore } from '@/store/budget';
import { useFolderStore } from '@/store/folder';
import { useOverridesStore } from '@/store/overrides';
import { useSyncStore } from '@/store/sync';
import { getLastSyncedAt } from '@/lib/sync';
import { syncAssetFolder } from '@/lib/assetSync';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'ダッシュボード' },
  { to: '/transactions', label: '取引一覧' },
  { to: '/categories', label: 'カテゴリ' },
  { to: '/budget', label: '予算' },
  { to: '/report', label: 'レポート' },
  { to: '/settings', label: '設定' },
];

export default function Layout() {
  const hydrate = useSyncStore((s) => s.hydrate);
  const folder = useFolderStore((s) => s.folder);
  const assetFolder = useFolderStore((s) => s.assetFolder);
  const accessToken = useAuthStore((s) => s.accessToken);
  const ensureFreshToken = useAuthStore((s) => s.ensureFreshToken);
  const budgetConfig = useBudgetStore((s) => s.config);
  const hydrateBudget = useBudgetStore((s) => s.hydrate);
  const overridesHydrated = useOverridesStore((s) => s.hydrated);
  const hydrateOverrides = useOverridesStore((s) => s.hydrate);

  // ログイン後の初回マウントで IndexedDB から最終同期時刻を復元
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const last = await getLastSyncedAt();
      if (!cancelled) hydrate(last);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  // 認証済み (= cookie が効いている) なら D1 から budget config を先読み
  useEffect(() => {
    if (budgetConfig) return;
    void hydrateBudget();
  }, [budgetConfig, hydrateBudget]);

  // フォルダがあれば overrides.json を Drive から同期
  useEffect(() => {
    if (!folder || !accessToken || overridesHydrated) return;
    let cancelled = false;
    void (async () => {
      const t = (await ensureFreshToken()) ?? accessToken;
      if (!cancelled && t) await hydrateOverrides(t, folder.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [folder, accessToken, overridesHydrated, ensureFreshToken, hydrateOverrides]);

  // 資産フォルダ（任意）が設定されていて、まだローカルに何も無いときだけ初回自動同期。
  // 2回目以降や差分取り込みは、資産CSVが小さく取り込みコストが軽いので mount のたびに走らせる。
  useEffect(() => {
    if (!assetFolder || !accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const t = (await ensureFreshToken()) ?? accessToken;
        if (!t || cancelled) return;
        await syncAssetFolder(t, assetFolder.id);
      } catch (e) {
        console.error('[asset-sync] failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetFolder?.id, accessToken]);

  return (
    <div className="min-h-screen grid grid-cols-[200px_1fr] max-md:grid-cols-1">
      <aside className="bg-sidebar border-r border-line p-6 flex flex-col gap-1 max-md:p-4 max-md:flex-row max-md:overflow-x-auto max-md:gap-2">
        <div className="px-3 pb-6 flex items-center gap-2 max-md:pb-0 max-md:shrink-0">
          <div className="w-2 h-2 bg-accent rounded-sm" />
          <div className="text-[13px] font-semibold tracking-wide">家計簿</div>
        </div>
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('nav-item max-md:shrink-0', isActive && 'nav-item-active')
            }
          >
            <span className="w-3.5 h-px bg-ink-40" />
            {label}
          </NavLink>
        ))}
        <div className="mt-auto pt-6 px-3 max-md:hidden space-y-5">
          <MembersSummary />
          <SyncStatus />
          <UserBadge />
        </div>
      </aside>

      <main className="p-7 overflow-hidden max-md:p-4">
        <Outlet />
      </main>
    </div>
  );
}

function MembersSummary() {
  const members = useBudgetStore((s) => s.config?.members);
  if (!members || members.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-[10px] tracking-[0.08em] text-ink-40">世帯メンバー</div>
      <div className="space-y-1.5">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-2 text-[12px]">
            <div
              className="w-[22px] h-[22px] rounded-full grid place-items-center text-white text-[10px] font-medium shrink-0"
              style={{ background: m.color }}
            >
              {m.name.charAt(0)}
            </div>
            <span className="truncate">{m.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncStatus() {
  const status = useSyncStore((s) => s.status);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const folder = useFolderStore((s) => s.folder);

  if (!folder) {
    return (
      <div className="text-[10px] leading-relaxed">
        <div className="tracking-[0.08em] text-ink-40">SYNC</div>
        <div className="mt-1 text-ink-40">未接続</div>
      </div>
    );
  }
  return (
    <div className="text-[10px] leading-relaxed">
      <div className="tracking-[0.08em] text-ink-40">最終更新</div>
      <div className="mt-1 text-ink-60 tabular-nums">
        {status === 'syncing' && '同期中…'}
        {status === 'error' && <span className="text-rose-700">エラー</span>}
        {status === 'idle' &&
          (lastSyncedAt ? dayjs(lastSyncedAt).format('YYYY/MM/DD HH:mm') : '未同期')}
      </div>
    </div>
  );
}

function UserBadge() {
  const email = useAuthStore((s) => s.email);
  const name = useAuthStore((s) => s.name);
  const picture = useAuthStore((s) => s.picture);
  const logout = useAuthStore((s) => s.logout);

  if (!email) {
    return null;
  }

  return (
    <div className="space-y-2 pt-3 border-t border-line">
      <div className="text-[10px] tracking-[0.08em] text-ink-40">アカウント</div>
      <div className="flex items-center gap-2">
        {picture ? (
          <img
            src={picture}
            alt=""
            className="w-6 h-6 rounded-full border border-line"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-accent/10 border border-line" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium truncate">{name ?? email}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="text-[10px] text-ink-40 hover:text-ink underline-offset-2 hover:underline"
      >
        ログアウト
      </button>
    </div>
  );
}
