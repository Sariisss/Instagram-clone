import { create } from 'zustand';
import { getDb } from '@/data/db';
import { useAuth } from '@/state/auth';
import type { Post } from '@/domain/types';

type S = { ids: Set<string>; load: () => Promise<void>; toggle: (p: Post) => Promise<void>; list: () => Promise<Post[]>; clearForUser: (userId: string) => Promise<void> };

const uid = () => useAuth.getState().session?.user.id ?? '';

/** Publicaciones guardadas: persistidas en SQLite (disponibles sin conexión), aisladas por usuario. */
export const useSaved = create<S>()((set, get) => ({
  ids: new Set(),
  load: async () => {
    const userId = uid();
    if (!userId) return;
    const db = await getDb();
    const rows = await db.getAllAsync<{ post_id: string }>(
      'SELECT post_id FROM saved_posts WHERE user_id=?',
      [userId],
    );
    set({ ids: new Set(rows.map((r) => r.post_id)) });
  },
  toggle: async (p) => {
    const userId = uid();
    if (!userId) return;
    const db = await getDb();
    const next = new Set(get().ids);
    if (next.has(p.id)) {
      next.delete(p.id);
      set({ ids: next });
      await db.runAsync('DELETE FROM saved_posts WHERE user_id=? AND post_id=?', [userId, p.id]);
    } else {
      next.add(p.id);
      set({ ids: next });
      await db.runAsync(
        'INSERT OR REPLACE INTO saved_posts (user_id, post_id, json, saved_at) VALUES (?,?,?,?)',
        [userId, p.id, JSON.stringify(p), Date.now()],
      );
    }
  },
  list: async () => {
    const userId = uid();
    if (!userId) return [];
    const db = await getDb();
    const rows = await db.getAllAsync<{ json: string }>(
      'SELECT json FROM saved_posts WHERE user_id=? ORDER BY saved_at DESC',
      [userId],
    );
    return rows.map((r) => JSON.parse(r.json) as Post);
  },
  /** Elimina los guardados de un usuario (llamar en signOut). */
  clearForUser: async (userId: string) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM saved_posts WHERE user_id=?', [userId]);
    set({ ids: new Set() });
  },
}));
