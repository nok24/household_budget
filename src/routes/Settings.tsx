import CategoryOrderEditor from '@/components/CategoryOrderEditor';
import MemberEditor from '@/components/MemberEditor';
import AccountAnchorEditor from '@/components/AccountAnchorEditor';
import AdminPanel from '@/components/AdminPanel';
import { useAuthStore } from '@/store/auth';

export default function Settings() {
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore((s) => s.serverSession?.isAdmin ?? false);

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-xl font-semibold">設定</h1>
        <p className="text-sm text-ink-60 mt-1">
          家族メンバー / 残高アンカー / カテゴリ並び順の管理。
          {isAdmin && ' Drive 接続・データ同期は admin 限定の管理パネルから。'}
        </p>
      </header>

      {isAdmin && <AdminPanel />}

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
            で並び替えて「保存」を押すと D1 に保存されます。
          </p>
        </div>
        <CategoryOrderEditor />
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
