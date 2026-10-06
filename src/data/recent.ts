import type { Profile } from '@/domain/types';
import { getDb } from './db';
import { useAuth } from '@/state/auth';

const ownerId = () => useAuth.getState().session?.user.id ?? '';

/** Búsquedas recientes de usuarios (persistidas en SQLite, aisladas por usuario). */
export async function loadRecent() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ json: string }>(
    'SELECT json FROM recent_searches WHERE owner_id=? ORDER BY ts DESC LIMIT 12',
    [ownerId()],
  );
  return rows.map((r) => JSON.parse(r.json) as Profile);
}
export async function addRecent(p: Profile) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO recent_searches (owner_id, user_id, json, ts) VALUES (?,?,?,?)',
    [ownerId(), p.id, JSON.stringify(p), Date.now()],
  );
}
export async function removeRecent(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM recent_searches WHERE owner_id=? AND user_id=?', [ownerId(), id]);
}
export async function clearRecent() {
  const db = await getDb();
  await db.runAsync('DELETE FROM recent_searches WHERE owner_id=?', [ownerId()]);
}
/** Elimina todas las búsquedas de un usuario (llamar en signOut). */
export async function clearRecentForUser(userId: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM recent_searches WHERE owner_id=?', [userId]);
}
