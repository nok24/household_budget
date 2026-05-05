import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import type { DbTransaction } from '@/lib/db';
import {
  useDeleteOverrideMutation,
  useOverrideByMfRowId,
  useUpsertOverrideMutation,
  type OverrideUpsertInput,
} from '@/lib/queries';
import { cn, formatYen } from '@/lib/utils';

interface Props {
  transaction: DbTransaction; // 元レコード（override 適用後の表示値）
  rawTransaction: DbTransaction; // override を適用していない元レコード
  open: boolean;
  onClose: () => void;
}

export default function EditTransactionModal({
  transaction,
  rawTransaction,
  open,
  onClose,
}: Props) {
  const existing = useOverrideByMfRowId(open ? rawTransaction.id : null);

  const [largeCategory, setLargeCategory] = useState('');
  const [midCategory, setMidCategory] = useState('');
  const [memo, setMemo] = useState('');
  const [transferOverride, setTransferOverride] = useState<
    'auto' | 'force-transfer' | 'force-not-transfer'
  >('auto');
  const [excluded, setExcluded] = useState(false);

  const upsertMutation = useUpsertOverrideMutation();
  const deleteMutation = useDeleteOverrideMutation();
  const busy = upsertMutation.isPending || deleteMutation.isPending;

  // モーダルが開いたとき or override 取得完了時に状態を初期化
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setLargeCategory(existing.largeCategory ?? '');
      setMidCategory(existing.midCategory ?? '');
      setMemo(existing.memo ?? '');
      setTransferOverride(
        existing.isTransferOverride === null
          ? 'auto'
          : existing.isTransferOverride
            ? 'force-transfer'
            : 'force-not-transfer',
      );
      setExcluded(existing.excluded === true);
    } else {
      setLargeCategory('');
      setMidCategory('');
      setMemo('');
      setTransferOverride('auto');
      setExcluded(false);
    }
  }, [open, existing]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onSave() {
    const input: OverrideUpsertInput = {
      sourceFileId: rawTransaction.sourceFileId,
      mfRowId: rawTransaction.id,
      largeCategory: largeCategory.trim() === '' ? null : largeCategory.trim(),
      midCategory: midCategory.trim() === '' ? null : midCategory.trim(),
      memo: memo === '' ? null : memo,
      isTransferOverride:
        transferOverride === 'auto' ? null : transferOverride === 'force-transfer',
      excluded: excluded ? true : null,
    };
    // 全フィールドが null なら upsert ではなく delete
    const allNull =
      input.largeCategory === null &&
      input.midCategory === null &&
      input.memo === null &&
      input.isTransferOverride === null &&
      input.excluded === null;
    try {
      if (allNull) {
        if (existing) {
          await deleteMutation.mutateAsync({
            sourceFileId: existing.sourceFileId,
            mfRowId: existing.mfRowId,
          });
        }
      } else {
        await upsertMutation.mutateAsync(input);
      }
      onClose();
    } catch (e) {
      console.error('[EditTransactionModal] save failed', e);
    }
  }

  async function onResetOverride() {
    if (!existing) {
      onClose();
      return;
    }
    try {
      await deleteMutation.mutateAsync({
        sourceFileId: existing.sourceFileId,
        mfRowId: existing.mfRowId,
      });
      onClose();
    } catch (e) {
      console.error('[EditTransactionModal] reset failed', e);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30"
      onClick={onClose}
    >
      <div className="card max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-wider text-ink-40">取引の上書き</div>
            <div className="text-sm text-ink-60 mt-0.5 tabular-nums">
              {dayjs(rawTransaction.date).format('YYYY/MM/DD')} ·{' '}
              <span
                className={cn(
                  'font-medium',
                  rawTransaction.amount >= 0 ? 'text-accent' : 'text-ink',
                )}
              >
                {rawTransaction.amount >= 0 ? '+' : '−'}
                {formatYen(Math.abs(rawTransaction.amount))}
              </span>
            </div>
            <div className="text-base font-medium mt-1">{rawTransaction.contentName}</div>
            <div className="text-[11px] text-ink-40 mt-0.5">
              {rawTransaction.account} · 元の大項目: {rawTransaction.largeCategory || '—'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-ink-40 hover:text-ink p-1 -m-1">
            ×
          </button>
        </header>

        <div className="space-y-3 pt-2 border-t border-line">
          <Field label="大項目（上書き）">
            <input
              value={largeCategory}
              onChange={(e) => setLargeCategory(e.target.value)}
              placeholder={`元: ${rawTransaction.largeCategory || '（空）'}`}
              className="w-full px-3 py-1.5 text-sm border border-line rounded-md focus:outline-none focus:border-accent"
            />
          </Field>
          <Field label="中項目（上書き）">
            <input
              value={midCategory}
              onChange={(e) => setMidCategory(e.target.value)}
              placeholder={`元: ${rawTransaction.midCategory || '（空）'}`}
              className="w-full px-3 py-1.5 text-sm border border-line rounded-md focus:outline-none focus:border-accent"
            />
          </Field>
          <Field label="メモ（上書き）">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder={rawTransaction.memo || '（空）'}
              className="w-full px-3 py-1.5 text-sm border border-line rounded-md focus:outline-none focus:border-accent resize-none"
            />
          </Field>

          <Field label="振替フラグ">
            <select
              value={transferOverride}
              onChange={(e) => setTransferOverride(e.target.value as typeof transferOverride)}
              className="w-full px-3 py-1.5 text-sm border border-line rounded-md focus:outline-none focus:border-accent bg-white"
            >
              <option value="auto">
                MFの判定を使う（現在: {rawTransaction.isTransfer ? '振替' : '通常'}）
              </option>
              <option value="force-transfer">強制的に「振替」扱い（集計から除外）</option>
              <option value="force-not-transfer">強制的に「通常」扱い（集計に含める）</option>
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excluded}
              onChange={(e) => setExcluded(e.target.checked)}
              className="accent-accent"
            />
            <span>この取引を集計から除外する</span>
          </label>
        </div>

        <footer className="flex items-center justify-between pt-3 border-t border-line">
          {existing ? (
            <button
              type="button"
              onClick={() => void onResetOverride()}
              disabled={busy}
              className="text-xs text-ink-60 hover:text-rose-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              上書きをクリア
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 text-xs border border-line rounded-md hover:bg-canvas disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {busy ? '保存中…' : '保存'}
            </button>
          </div>
        </footer>

        <p className="text-[10px] text-ink-40 leading-relaxed">
          保存すると D1 (サーバ)
          に即時反映され、家族の端末でも次回画面更新時に同じ上書きが見えます。
          {transaction !== rawTransaction && '（このカードに表示中の値は既に上書き反映済み）'}
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] tracking-wider text-ink-60 mb-1">{label}</div>
      {children}
    </label>
  );
}
