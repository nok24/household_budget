// Step 4 以降で実装するデータレイヤの型定義の置き場。
// 計画書の budget.json / overrides.json / Transaction スキーマに対応する。

export type CategoryId = string;
export type MemberId = string;
export type TransactionId = string;

export interface Transaction {
  id: TransactionId;
  date: string;          // YYYY-MM-DD（JST）
  amount: number;        // 円、支出は負・収入は正
  contentName: string;   // MF「内容」
  account: string;       // MF「保有金融機関」
  largeCategory: string; // MF「大項目」
  midCategory: string;   // MF「中項目」
  memo: string;          // MF「メモ」
  isTarget: boolean;     // 計算対象
  isTransfer: boolean;   // 振替
  // 解決後の値（overrides + matchers 適用）
  categoryId: CategoryId;
  memberId: MemberId;
}

export interface CategoryDef {
  id: CategoryId;
  name: string;
  color: string;
  matchers: { 大項目?: string[]; 中項目?: string[] };
}

export interface MemberDef {
  id: MemberId;
  name: string;
  color: string;
  accountPatterns: string[];
}

export interface BudgetConfig {
  version: 1;
  schemaVersion: string;
  members: MemberDef[];
  categories: CategoryDef[];
  /** ユーザが指定するカテゴリの並び順（大項目名）。未掲載のカテゴリは末尾に名前順で並ぶ。*/
  categoryOrder: string[];
  budgets: {
    default: Record<CategoryId, number>;
    monthly: Record<string, Record<CategoryId, number | string>>; // "YYYY-MM"
  };
  settings: {
    fiscalMonthStartDay: number;
    incomeCategoryId: CategoryId;
    excludeTransfers: boolean;
    excludeNonTarget: boolean;
  };
}

export interface OverridesConfig {
  version: 1;
  byTxId: Record<
    TransactionId,
    Partial<{ categoryId: CategoryId; memberId: MemberId; memo: string }>
  >;
}
