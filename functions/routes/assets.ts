import { Hono } from 'hono';
import { asc } from 'drizzle-orm';
import type { AppBindings } from '../types';
import { requireAuth } from '../lib/authMiddleware';
import { getDb } from '../lib/db';
import { assetSnapshots } from '../db/schema';

export const assetsRouter = new Hono<AppBindings>();

assetsRouter.use('*', requireAuth);

/**
 * 全期間の月末スナップショットを返す。家庭利用なので 1 ペイロードで取り切る。
 */
assetsRouter.get('/snapshots', async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(assetSnapshots).orderBy(asc(assetSnapshots.yearMonth));
  return c.json({
    snapshots: rows.map((r) => ({
      yearMonth: r.yearMonth,
      date: r.date,
      total: r.total,
      savings: r.savings,
      stocks: r.stocks,
      funds: r.funds,
      pension: r.pension,
      points: r.points,
    })),
  });
});
