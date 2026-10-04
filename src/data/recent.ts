import type { Profile } from '@/domain/types';
import { getDb } from './db';

/** Búsquedas recientes de usuarios (persistidas en SQLite). */
export async function loadRecent() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM recent_searches ORDER BY ts DESC LIMIT 12');
  return rows.map((r) => JSON.parse(r.json) as Profile);
}
export async function addRecent(p: Profile) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO recent_searches (user_id, json, ts) VALUES (?,?,?)', [p.id, JSON.stringify(p), Date.now()]);
}
export async function removeRecent(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM recent_searches WHERE user_id=?', [id]);
}
export async function clearRecent() {
  const db = await getDb();
  await db.runAsync('DELETE FROM recent_searches');
}
