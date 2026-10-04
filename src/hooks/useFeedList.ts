import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/data/api';
import { getDb } from '@/data/db';
import { applyPending, useFeed } from '@/state/feed';
import type { Post } from '@/domain/types';

const PAGE = 10;

export function useFeedList(scope: 'home' | 'explore' | 'user' | 'reels', user?: string) {
  const [ids, setIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const cursor = useRef<string | null>(null);
  const end = useRef(false);
  const busy = useRef(false);
  const upsert = useFeed((s) => s.upsert);
  const tick = useFeed((s) => s.tick);

  const load = useCallback(async (reset: boolean) => {
    if (busy.current || (!reset && end.current)) return;
    busy.current = true;
    if (reset) { setRefreshing(true); end.current = false; cursor.current = null; }
    try {
      const raw = await api.fetchFeed({ scope, user, before: reset ? null : cursor.current, limit: PAGE });
      const posts = await applyPending(raw);
      upsert(posts);
      setOffline(false);
      if (posts.length < PAGE) end.current = true;
      if (posts.length) cursor.current = posts[posts.length - 1].created_at;
      setIds((prev) => (reset ? posts.map((p) => p.id) : [...prev, ...posts.filter((p) => !prev.includes(p.id)).map((p) => p.id)]));
      if (reset && scope === 'home') {
        getDb().then((db) => db.runAsync('INSERT OR REPLACE INTO feed_cache (scope, json, updated_at) VALUES (?,?,?)', ['home', JSON.stringify(posts), Date.now()])).catch(() => {});
      }
    } catch {
      setOffline(true);
      if (reset && scope === 'home') { // lectura offline desde SQLite
        const db = await getDb();
        const row = await db.getFirstAsync<{ json: string }>(`SELECT json FROM feed_cache WHERE scope='home'`);
        if (row) { const cached = await applyPending(JSON.parse(row.json) as Post[]); upsert(cached); setIds(cached.map((p) => p.id)); }
      }
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [scope, user, upsert]);

  useEffect(() => { load(true); }, [load, tick]);

  return { ids, refreshing, offline, refresh: () => load(true), loadMore: () => load(false) };
}
