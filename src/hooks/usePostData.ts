import { useCallback, useEffect, useState } from 'react';
import * as api from '@/data/api';
import { outbox } from '@/data/outbox';
import { supabase } from '@/core/supabase';
import { applyPending, useFeed } from '@/state/feed';
import { useAuth } from '@/state/auth';
import type { Comment } from '@/domain/types';

const EMPTY: Comment[] = [];

/** Publicación + comentarios en tiempo real (carga inicial, cola offline y Supabase Realtime). */
export function usePostData(id: string) {
  const me = useAuth((s) => s.me)!;
  const post = useFeed((s) => s.posts[id]);
  const comments = useFeed((s) => s.comments[id]) ?? EMPTY;
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      if (!useFeed.getState().posts[id]) { // llegada por deep link: el post puede no estar en memoria
        const [p] = await api.fetchFeed({ scope: 'one', post: id, limit: 1 });
        if (!p) { setMissing(true); return; }
        useFeed.getState().upsert(await applyPending([p]));
      }
      const server = await api.fetchComments(id);
      const serverIds = new Set(server.map((c) => c.id));
      const pend = (await outbox.pending()).filter((a) => a.type === 'COMMENT' && a.postId === id && !serverIds.has(a.id)) as any[];
      useFeed.getState().setComments(id, [...server, ...pend.map((a) => ({ id: a.id, post_id: id, user_id: me.id, username: me.username, avatar_url: me.avatar_url, body: a.body, created_at: new Date().toISOString(), pending: true }))]);
    } catch {}
  }, [id, me]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel(`comments:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `post_id=eq.${id}` }, async (p) => {
        const r = p.new as any;
        const prof = (await api.profilesByIds([r.user_id]))[r.user_id];
        const isNew = useFeed.getState().mergeComment({ id: r.id, post_id: id, user_id: r.user_id, body: r.body, created_at: r.created_at, username: prof?.username ?? '?', avatar_url: prof?.avatar_url ?? null, pending: false });
        const cur = useFeed.getState().posts[id];
        if (isNew && cur && r.user_id !== me.id) useFeed.getState().patch(id, { comment_count: cur.comment_count + 1 });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, me.id]);

  const send = useCallback((body: string) => { const b = body.trim(); if (b) useFeed.getState().addComment(id, b); }, [id]);
  const remove = useCallback(async (comment: Comment) => {
    if (comment.user_id !== me.id || comment.pending) return;
    useFeed.getState().removeComment(id, comment.id);
    const current = useFeed.getState().posts[id];
    if (current) useFeed.getState().patch(id, { comment_count: Math.max(0, current.comment_count - 1) });
    try { await api.deleteComment(comment.id); }
    catch (error) { await load(); throw error; }
  }, [id, load, me.id]);
  return { post, comments, missing, send, remove };
}
