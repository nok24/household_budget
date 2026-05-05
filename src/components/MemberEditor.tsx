import { useEffect, useMemo, useRef, useState } from 'react';
import { useBudgetStore } from '@/store/budget';
import { distinctAccountsFromArray } from '@/lib/aggregate';
import { useAppliedTransactions } from '@/lib/queries';
import { inferMemberId, MEMBER_PRESET_COLORS, newMember } from '@/lib/members';
import { cn } from '@/lib/utils';
import type { MemberDef } from '@/types';

export default function MemberEditor() {
  const config = useBudgetStore((s) => s.config);
  const setConfig = useBudgetStore((s) => s.setConfig);
  const isDirty = useBudgetStore((s) => s.isDirty);
  const status = useBudgetStore((s) => s.status);
  const error = useBudgetStore((s) => s.error);
  const save = useBudgetStore((s) => s.save);

  const { data: applied } = useAppliedTransactions();
  const accounts = useMemo(() => distinctAccountsFromArray(applied), [applied]);

  const accountAssignments = useMemo(() => {
    if (!config) return new Map<string, string | null>();
    const m = new Map<string, string | null>();
    for (const a of accounts) {
      m.set(a.name, inferMemberId(a.name, config));
    }
    return m;
  }, [config, accounts]);

  if (!config) {
    return <p className="text-sm text-ink-60">予算データを読み込み中…</p>;
  }

  function updateMember(idx: number, patch: Partial<MemberDef>) {
    setConfig((prev) => ({
      ...prev,
      members: prev.members.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    }));
  }

  function removeMember(idx: number) {
    setConfig((prev) => ({
      ...prev,
      members: prev.members.filter((_, i) => i !== idx),
    }));
  }

  function addMember() {
    setConfig((prev) => ({
      ...prev,
      members: [...prev.members, newMember()],
    }));
  }

  function addPatternToMember(memberIdx: number, pattern: string) {
    setConfig((prev) => ({
      ...prev,
      members: prev.members.map((m, i) =>
        i === memberIdx
          ? {
              ...m,
              accountPatterns: m.accountPatterns.includes(pattern)
                ? m.accountPatterns
                : [...m.accountPatterns, pattern],
            }
          : m,
      ),
    }));
  }

  async function onSave() {
    await save();
  }

  const unassigned = accounts.filter((a) => !accountAssignments.get(a.name));

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {config.members.map((m, idx) => (
          <MemberCard
            key={m.id}
            member={m}
            assignedAccounts={accounts.filter((a) => accountAssignments.get(a.name) === m.id)}
            canDelete={config.members.length > 1}
            onChange={(patch) => updateMember(idx, patch)}
            onDelete={() => removeMember(idx)}
          />
        ))}
        <button
          type="button"
          onClick={addMember}
          className="w-full px-4 py-2 text-xs text-ink-60 border border-dashed border-line rounded-md hover:bg-canvas hover:text-ink"
        >
          ＋ メンバーを追加
        </button>
      </div>

      {unassigned.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-line">
          <div className="text-xs font-medium tracking-wider text-ink-70">
            未割当の口座（{unassigned.length}件）
          </div>
          <p className="text-[11px] text-ink-40">クリックして任意のメンバーに振り分けます。</p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((a) => (
              <UnassignedAccountChip
                key={a.name}
                account={a.name}
                count={a.count}
                members={config.members}
                onAssign={(memberIdx) => addPatternToMember(memberIdx, a.name)}
              />
            ))}
          </div>
        </div>
      )}

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

function MemberCard({
  member,
  assignedAccounts,
  canDelete,
  onChange,
  onDelete,
}: {
  member: MemberDef;
  assignedAccounts: { name: string; count: number }[];
  canDelete: boolean;
  onChange: (patch: Partial<MemberDef>) => void;
  onDelete: () => void;
}) {
  const patternsText = member.accountPatterns.join('\n');

  return (
    <div className="border border-line rounded-md p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
          style={{ background: member.color }}
        >
          {member.name.charAt(0)}
        </div>
        <input
          value={member.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 px-2 py-1 text-sm border border-line rounded-md focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="text-xs text-ink-60 hover:text-rose-700 disabled:opacity-30 disabled:hover:text-ink-60"
        >
          削除
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] tracking-wider text-ink-40 w-12">COLOR</span>
        <div className="flex gap-1.5 flex-wrap">
          {MEMBER_PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ color: c })}
              className={cn(
                'w-5 h-5 rounded-full transition-transform',
                member.color === c && 'ring-2 ring-offset-1 ring-ink/40 scale-110',
              )}
              style={{ background: c }}
              aria-label={`色 ${c}`}
            />
          ))}
        </div>
      </div>

      <label className="block">
        <div className="text-[10px] tracking-wider text-ink-40 mb-1">
          口座マッチパターン（部分一致、改行区切り）
        </div>
        <textarea
          value={patternsText}
          onChange={(e) =>
            onChange({
              accountPatterns: e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          rows={Math.max(2, member.accountPatterns.length + 1)}
          placeholder="例: 楽天カード&#10;みずほ銀行"
          className="w-full px-2 py-1.5 text-xs border border-line rounded-md font-mono focus:outline-none focus:border-accent resize-none"
        />
      </label>

      {assignedAccounts.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-line">
          <div className="text-[10px] tracking-wider text-ink-40">
            マッチしている口座（{assignedAccounts.length}件）
          </div>
          <div className="flex flex-wrap gap-1">
            {assignedAccounts.map((a) => (
              <span
                key={a.name}
                className="text-[10px] px-1.5 py-0.5 rounded-sm bg-canvas text-ink-60"
                title={`${a.count}件の取引`}
              >
                {a.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UnassignedAccountChip({
  account,
  count,
  members,
  onAssign,
}: {
  account: string;
  count: number;
  members: MemberDef[];
  onAssign: (memberIdx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'text-[11px] px-2 py-1 rounded-sm border transition-colors',
          open
            ? 'bg-accent/10 border-accent/40 text-ink'
            : 'bg-canvas border-line hover:bg-line/30',
        )}
      >
        <span className="font-medium">{account}</span>
        <span className="text-ink-40 ml-1">({count})</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-10 flex flex-col bg-white border border-line rounded-md shadow-card overflow-hidden min-w-[140px]"
        >
          {members.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onAssign(i);
                setOpen(false);
              }}
              className="text-xs px-3 py-1.5 text-left hover:bg-canvas flex items-center gap-2 whitespace-nowrap"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
              {m.name} に追加
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
