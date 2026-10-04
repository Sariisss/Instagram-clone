import { create } from 'zustand';
import { getDb } from '@/data/db';
import type { Post } from '@/domain/types';

type S = { ids: Set<string>; load: () => Promise<void>; toggle: (p: Post) => Promise<void>; list: () => Promise<Post[]> };

/** Publicaciones guardadas: persistidas en SQLite (disponibles sin conexión). */
export const useSaved = create<S>()((set, get) => ({
  ids: new Set(),
  load: async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<{ post_id: string }>('SELECT post_id FROM saved_posts');
    set({ ids: new Set(rows.map((r) => r.post_id)) });
  },
  toggle: async (p) => {
    const db = await getDb();
    const next = new Set(get().ids);
    if (next.has(p.id)) { next.delete(p.id); set({ ids: next }); await db.runAsync('DELETE FROM saved_posts WHERE post_id=?', [p.id]); }
    else { next.add(p.id); set({ ids: next }); await db.runAsync('INSERT OR REPLACE INTO saved_posts (post_id, json, saved_at) VALUES (?,?,?)', [p.id, JSON.stringify(p), Date.now()]); }
  },
  list: async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM saved_posts ORDER BY saved_at DESC');
    return rows.map((r) => JSON.parse(r.json) as Post);
  },
}));
