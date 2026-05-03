import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import type { AppBindings } from '../types';
import { requireAuth } from '../lib/authMiddleware';
import { getDb } from '../lib/db';
import { transactions } from '../db/schema';

export const transactionsRouter = new Hono<AppBindings>();

transactionsRouter.use('*', requireAuth);

/**
 * 全取引を返す。フロントの一覧/集計でローカルにキャッシュして使う想定。
 * D1 に数千〜数万行入っても 1 リクエストで取り切れる規模を想定。
 */
transactionsRouter.get('/all', async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(transactions).orderBy(asc(transactions.date));
  return c.json({
    transactions: rows.map(serialize),
  });
});

/**
 * 指定 yearMonth (YYYY-MM) の取引を返す。
 */
transactionsRouter.get('/', async (c) => {
  const yearMonth = c.req.query('yearMonth');
  const db = getDb(c.env);
  const query = db.select().from(transactions);
  const rows = yearMonth
    ? await query.where(eq(transactions.yearMonth, yearMonth)).orderBy(asc(transactions.date))
    : await query.orderBy(asc(transactions.date));
  return c.json({
    transactions: rows.map(serialize),
  });
});

interface SerializedTransaction {
  /** フロント互換のため MF Row ID を id として返す (旧 DbTransaction.id と同じ) */
  id: string;
  /** 内部 surrogate id (主に override 永続化で利用、Phase 4) */
  surrogateId: number;
  sourceFileId: string;
  date: string;
  yearMonth: string;
  amount: number;
  contentName: string;
  account: string;
  largeCategory: string;
  midCategory: string;
  memo: string;
  isTarget: boolean;
  isTransfer: boolean;
}

function serialize(row: typeof transactions.$inferSelect): SerializedTransaction {
  return {
    id: row.mfRowId,
    surrogateId: row.id,
    sourceFileId: row.sourceFileId,
    date: row.date,
    yearMonth: row.yearMonth,
    amount: row.amount,
    contentName: row.contentName ?? '',
    account: row.account ?? '',
    largeCategory: row.largeCategory ?? '',
    midCategory: row.midCategory ?? '',
    memo: row.memo ?? '',
    isTarget: row.isTarget === 1,
    isTransfer: row.isTransfer === 1,
  };
}
