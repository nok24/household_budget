import { useEffect, type ReactNode } from 'react';
import { shouldAttemptSilentOnMount, useAuthStore } from '@/store/auth';

interface AuthGateProps {
  children: ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const email = useAuthStore((s) => s.email);
  const init = useAuthStore((s) => s.init);
  const login = useAuthStore((s) => s.login);
  const silentRefresh = useAuthStore((s) => s.silentRefresh);
  const logout = useAuthStore((s) => s.logout);

  // 初回マウントで GIS スクリプトを読み込む。
  // 過去に明示ログイン済みのブラウザでだけ silent re-auth を試行する
  // （未ログインで silent を呼ぶとポップアップを開けず単に失敗するだけなので無駄打ちしない）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await init();
      if (cancelled) return;
      if (shouldAttemptSilentOnMount()) {
        void silentRefresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [init, silentRefresh]);

  if (status === 'ready') {
    return <>{children}</>;
  }

  // 初期化中は何も描画しない (cookie 復帰中にログイン UI が一瞬出るのを防ぐ)
  if (status === 'initializing') {
    return <div className="min-h-screen bg-canvas" aria-hidden />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-canvas">
      <div className="card max-w-md w-full p-8 space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-accent rounded-sm" />
          <div className="text-[13px] font-semibold tracking-wide">家計簿</div>
        </div>

        {status === 'unauthorized' ? (
          <>
            <h1 className="text-xl font-semibold leading-tight">アクセスできません</h1>
            <p className="text-sm text-ink-70 leading-relaxed">
              {email ? <span className="font-medium">{email}</span> : 'このアカウント'}{' '}
              は許可されていません。家族のGoogleアカウントで再ログインしてください。
            </p>
            <button
              type="button"
              onClick={() => void logout().then(() => login())}
              className="inline-flex items-center justify-center w-full bg-accent text-white text-sm font-medium px-4 py-2.5 rounded-md hover:opacity-90 transition-opacity"
            >
              別のアカウントでログイン
            </button>
          </>
        ) : status === 'error' ? (
          <>
            <h1 className="text-xl font-semibold leading-tight">読み込みエラー</h1>
            <p className="text-sm text-ink-70 leading-relaxed">
              {error ?? '原因不明のエラーが発生しました'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center w-full bg-accent text-white text-sm font-medium px-4 py-2.5 rounded-md hover:opacity-90 transition-opacity"
            >
              再読み込み
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold leading-tight">ログイン</h1>
            <p className="text-sm text-ink-70 leading-relaxed">
              家族のGoogleアカウントでログインしてください。
              マネーフォワードのCSVが置かれているDriveフォルダを次の画面で選びます。
            </p>
            <button
              type="button"
              disabled={status === 'authenticating'}
              onClick={() => void login()}
              className="inline-flex items-center justify-center w-full bg-accent text-white text-sm font-medium px-4 py-2.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {status === 'authenticating' ? 'ログイン中…' : 'Googleでログイン'}
            </button>
            <p className="text-[11px] text-ink-40 leading-relaxed pt-2 border-t border-line">
              スコープ: <code className="font-numeric">drive.readonly</code> （CSV読み取り） +{' '}
              <code className="font-numeric">drive.file</code> （設定ファイル書き込み）。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
