import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../types';
import * as schema from '../db/schema';

export type Database = ReturnType<typeof getDb>;

export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}
