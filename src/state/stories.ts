import { create } from 'zustand';
import { getDb } from '@/data/db';
import { useAuth } from '@/state/auth';
import * as api from '@/data/api';
import type { StoryGroup } from '@/domain/types';

type S = {
  groups: StoryGroup[]; seen: Set<string>;
  load: () => Promise<void>; loadSeen: () => Promise<void>; markSeen: (storyId: string) => void;
  clearForUser: (userId: string) => Promise<void>;
};

const uid = () => useAuth.getState().session?.user.id ?? '';

export const useStories = create<S>()((set, get) => ({
  groups: [], seen: new Set(),
  load: async () => { try { set({ groups: await api.fetchStoryGroups() }); } catch {} },
  loadSeen: async () => {
    const userId = uid();
    if (!userId) return;
    const db = await getDb();
    const rows = await db.getAllAsync<{ story_id: string }>(
      'SELECT story_id FROM story_seen WHERE user_id=?',
      [userId],
    );
    set({ seen: new Set(rows.map((r) => r.story_id)) });
  },
  // Persistencia local del estado "visto" (sobrevive reinicios de la app).
  markSeen: (id) => {
    if (get().seen.has(id)) return;
    set({ seen: new Set(get().seen).add(id) });
    const userId = uid();
    if (!userId) return;
    getDb()
      .then((db) => db.runAsync(
        'INSERT OR IGNORE INTO story_seen (user_id, story_id, seen_at) VALUES (?,?,?)',
        [userId, id, Date.now()],
      ))
      .catch(() => {});
  },
  /** Elimina las historias vistas de un usuario (llamar en signOut). */
  clearForUser: async (userId: string) => {
    const db = await getDb();
    await db.runAsync('DELETE FROM story_seen WHERE user_id=?', [userId]);
    set({ seen: new Set(), groups: [] });
  },
}));
