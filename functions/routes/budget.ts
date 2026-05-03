import { Hono } from 'hono';
import type { AppBindings } from '../types';
import { requireAuth } from '../lib/authMiddleware';
import { getDb } from '../lib/db';
import { readBudgetConfig, validateBudgetConfig, writeBudgetConfig } from '../lib/budgetConfig';

export const budgetRouter = new Hono<AppBindings>();

// 読みは login 済みなら誰でも、書きは admin 限定 (CSRF middleware は app.use 経由で適用済み)
budgetRouter.use('*', requireAuth);

budgetRouter.get('/', async (c) => {
  const db = getDb(c.env);
  const config = await readBudgetConfig(db);
  return c.json(config);
});

budgetRouter.put('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  let validated;
  try {
    validated = validateBudgetConfig(body);
  } catch (e) {
    return c.json(
      { error: 'invalid_body', detail: e instanceof Error ? e.message : 'unknown' },
      400,
    );
  }
  const db = getDb(c.env);
  await writeBudgetConfig(db, validated);
  const fresh = await readBudgetConfig(db);
  return c.json(fresh);
});
