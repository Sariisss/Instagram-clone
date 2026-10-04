import { create } from 'zustand';
import { getDb } from '@/data/db';
import * as api from '@/data/api';
import type { StoryGroup } from '@/domain/types';

type S = {
  groups: StoryGroup[]; seen: Set<string>;
  load: () => Promise<void>; loadSeen: () => Promise<void>; markSeen: (storyId: string) => void;
};

export const useStories = create<S>()((set, get) => ({
  groups: [], seen: new Set(),
  load: async () => { try { set({ groups: await api.fetchStoryGroups() }); } catch {} },
  loadSeen: async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<{ story_id: string }>('SELECT story_id FROM story_seen');
    set({ seen: new Set(rows.map((r) => r.story_id)) });
  },
  // Persistencia local del estado "visto" (sobrevive reinicios de la app).
  markSeen: (id) => {
    if (get().seen.has(id)) return;
    set({ seen: new Set(get().seen).add(id) });
    getDb().then((db) => db.runAsync('INSERT OR IGNORE INTO story_seen (story_id, seen_at) VALUES (?,?)', [id, Date.now()])).catch(() => {});
  },
}));
