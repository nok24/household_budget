import { useEffect, useState } from 'react';
import { useBudgetStore } from '@/store/budget';
import { cn } from '@/lib/utils';
import type { AccountAnchor } from '@/types';

// 機関別残高アンカーの編集 UI。budget.json に保存され、ダッシュボードで
// 月末推定残高の算出に使われる。

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function newAnchor(): AccountAnchor {
  return {
    id: `anchor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: 'みずほ',
    pattern: 'みずほ銀行',
    asOfDate: todayIso(),
    balance: 0,
  };
}

export default function AccountAnchorEditor() {
  const config = useBudgetStore((s) => s.config);
  const setConfig = useBudgetStore((s) => s.setConfig);
  const isDirty = useBudgetStore((s) => s.isDirty);
  const status = useBudgetStore((s) => s.status);
  const error = useBudgetStore((s) => s.error);
  const save = useBudgetStore((s) => s.save);

  if (!config) {
    return <p className="text-sm text-ink-60">予算データを読み込み中…</p>;
  }

  const anchors = config.accountAnchors ?? [];

  function update(idx: number, patch: Partial<AccountAnchor>) {
    setConfig((prev) => ({
      ...prev,
      accountAnchors: (prev.accountAnchors ?? []).map((a, i) =>
        i === idx ? { ...a, ...patch } : a,
      ),
    }));
  }

  function remove(idx: number) {
    setConfig((prev) => ({
      ...prev,
      accountAnchors: (prev.accountAnchors ?? []).filter((_, i) => i !== idx),
    }));
  }

  function add() {
    setConfig((prev) => ({
      ...prev,
      accountAnchors: [...(prev.accountAnchors ?? []), newAnchor()],
    }));
  }

  async function onSave() {
    await save();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {anchors.length === 0 ? (
          <p className="text-xs text-ink-60">
            アンカーが登録されていません。「+ アンカーを追加」から作成してください。
          </p>
        ) : (
          anchors.map((a, idx) => (
            <AnchorCard
              key={a.id}
              anchor={a}
              onChange={(patch) => update(idx, patch)}
              onDelete={() => remove(idx)}
            />
          ))
        )}
        <button
          type="button"
          onClick={add}
          className="w-full px-4 py-2 text-xs text-ink-60 border border-dashed border-line rounded-md hover:bg-canvas hover:text-ink"
        >
          ＋ アンカーを追加
        </button>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        {error && <span className="text-xs text-rose-700">{error}</span>}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!isDirty || status === 'saving'}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-opacity',
            !isDirty || status === 'saving'
              ? 'bg-ink-40/40 text-white cursor-not-allowed'
              : 'bg-accent text-white hover:opacity-90',
          )}
        >
          {status === 'saving' ? '保存中…' : isDirty ? '保存' : '保存済'}
        </button>
      </div>
    </div>
  );
}

function AnchorCard({
  anchor,
  onChange,
  onDelete,
}: {
  anchor: AccountAnchor;
  onChange: (patch: Partial<AccountAnchor>) => void;
  onDelete: () => void;
}) {
  const [balanceText, setBalanceText] = useState(anchor.balance.toString());

  // 外部から anchor.balance が変わったとき（保存後・他ユーザ更新後）に同期
  useEffect(() => {
    setBalanceText(anchor.balance.toString());
  }, [anchor.balance]);

  function commitBalance() {
    const n = Number(balanceText.replace(/[,\s]/g, ''));
    if (Number.isFinite(n) && n !== anchor.balance) {
      onChange({ balance: n });
    } else {
      // 不正値ならロールバック
      setBalanceText(anchor.balance.toString());
    }
  }

  return (
    <div className="border border-line rounded-md p-4 space-y-3">
      <div className="flex items-center gap-3">
        <input
          value={anchor.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="ラベル"
          className="flex-1 px-2 py-1 text-sm border border-line rounded-md focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-ink-60 hover:text-rose-700"
        >
          削除
        </button>
      </div>

      <label className="block">
        <div className="text-[10px] tracking-wider text-ink-40 mb-1">
          機関名パターン（部分一致）
        </div>
        <input
          value={anchor.pattern}
          onChange={(e) => onChange({ pattern: e.target.value })}
          placeholder="例: みずほ銀行"
          className="w-full px-2 py-1 text-sm border border-line rounded-md focus:outline-none focus:border-accent"
        />
      </label>

      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <label className="block">
          <div className="text-[10px] tracking-wider text-ink-40 mb-1">基準日</div>
          <input
            type="date"
            value={anchor.asOfDate}
            onChange={(e) => onChange({ asOfDate: e.target.value })}
            className="w-full px-2 py-1 text-sm border border-line rounded-md focus:outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <div className="text-[10px] tracking-wider text-ink-40 mb-1">基準残高（円）</div>
          <input
            type="text"
            inputMode="numeric"
            value={balanceText}
            onChange={(e) => setBalanceText(e.target.value)}
            onBlur={commitBalance}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="1234567"
            className="w-full px-2 py-1 text-sm border border-line rounded-md tabular-nums focus:outline-none focus:border-accent"
          />
        </label>
      </div>

      <p className="text-[11px] text-ink-40 leading-relaxed">
        基準日時点の残高を入れると、取引データの収支を遡って各月末の推定残高を算出します。
        正確な金額である必要はなく、概算で OK。
      </p>
    </div>
  );
}
