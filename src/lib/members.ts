import type { BudgetConfig, MemberDef } from '@/types';

export const UNASSIGNED_MEMBER_ID = '_unassigned';
export const UNASSIGNED_MEMBER: MemberDef = {
  id: UNASSIGNED_MEMBER_ID,
  name: '未割当',
  color: '#9C9C9C',
  accountPatterns: [],
};

/**
 * 口座名からメンバーIDを推定する。
 * 各メンバーの accountPatterns を順に部分一致で照合し、最初にマッチしたメンバーを返す。
 * どれにもマッチしない場合は null（未割当）。
 */
export function inferMemberId(
  account: string,
  config: BudgetConfig | null,
): string | null {
  if (!config) return null;
  for (const m of config.members) {
    for (const pattern of m.accountPatterns) {
      if (!pattern) continue;
      if (account.includes(pattern)) return m.id;
    }
  }
  return null;
}

export function findMember(
  config: BudgetConfig | null,
  memberId: string | null,
): MemberDef {
  if (!config || !memberId) return UNASSIGNED_MEMBER;
  return config.members.find((m) => m.id === memberId) ?? UNASSIGNED_MEMBER;
}

export function newMember(): MemberDef {
  const id = `m_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: '新しいメンバー',
    color: '#7B8F6E',
    accountPatterns: [],
  };
}

export const MEMBER_PRESET_COLORS = [
  '#3F5A4A',
  '#7B8F6E',
  '#B8A78A',
  '#A89884',
  '#8E9AAB',
  '#C9967A',
  '#9C8FA8',
  '#B5916A',
];
