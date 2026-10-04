import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import type { Comment, Post } from '@/domain/types';
import { outbox, type Action } from '@/data/outbox';
import { useAuth } from './auth';

type S = {
  posts: Record<string, Post>;
  comments: Record<string, Comment[]>;
  tick: number;
  upsert: (ps: Post[]) => void;
  patch: (id: string, p: Partial<Post>) => void;
  bump: () => void;
  removePost: (id: string) => void;
  toggleLike: (id: string) => Promise<void>;
  setComments: (postId: string, list: Comment[]) => void;
  mergeComment: (c: Comment) => boolean; // true si era nuevo
  removeComment: (postId: string, id: string) => void;
  addComment: (postId: string, body: string) => Promise<void>;
};

export const useFeed = create<S>()((set, get) => ({
  posts: {}, comments: {}, tick: 0,
  upsert: (ps) => set((s) => { const next = { ...s.posts }; for (const p of ps) next[p.id] = p; return { posts: next }; }),
  patch: (id, p) => set((s) => (s.posts[id] ? { posts: { ...s.posts, [id]: { ...s.posts[id], ...p } } } : s)),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  removePost: (id) => set((s) => { const posts = { ...s.posts }; delete posts[id]; return { posts, tick: s.tick + 1 }; }),

  // UI optimista: el estado local cambia al instante (0 ms); la red va por la cola offline.
  toggleLike: async (id) => {
    const p = get().posts[id];
    if (!p) return;
    const liked = !p.liked_by_me;
    get().patch(id, { liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) });
    await outbox.enqueue(liked ? { type: 'LIKE', postId: id } : { type: 'UNLIKE', postId: id });
  },

  setComments: (postId, list) => set((s) => ({ comments: { ...s.comments, [postId]: list } })),
  mergeComment: (c) => {
    const cur = get().comments[c.post_id] ?? [];
    const i = cur.findIndex((x) => x.id === c.id);
    const next = i >= 0 ? cur.map((x, k) => (k === i ? { ...x, ...c, pending: c.pending } : x)) : [...cur, c];
    set((s) => ({ comments: { ...s.comments, [c.post_id]: next } }));
    return i < 0;
  },
  removeComment: (postId, id) => set((s) => ({ comments: { ...s.comments, [postId]: (s.comments[postId] ?? []).filter((c) => c.id !== id) } })),
  addComment: async (postId, body) => {
    const me = useAuth.getState().me!;
    const id = Crypto.randomUUID();
    get().mergeComment({ id, post_id: postId, user_id: me.id, username: me.username, avatar_url: me.avatar_url, body, created_at: new Date().toISOString(), pending: true });
    const p = get().posts[postId];
    if (p) get().patch(postId, { comment_count: p.comment_count + 1 });
    await outbox.enqueue({ type: 'COMMENT', id, postId, body });
  },
}));

let bound = false;
/** Conecta los resultados de la cola con el estado de la UI (confirmar o revertir). */
export function bindOutbox() {
  if (bound) return;
  bound = true;
  outbox.onSynced((a: Action) => {
    if (a.type !== 'COMMENT') return;
    const c = useFeed.getState().comments[a.postId]?.find((x) => x.id === a.id);
    if (c) useFeed.getState().mergeComment({ ...c, pending: false });
  });
  outbox.onFailed((a: Action) => {
    const s = useFeed.getState();
    if (a.type === 'LIKE' || a.type === 'UNLIKE') {
      const p = s.posts[a.postId];
      if (p) s.patch(a.postId, { liked_by_me: a.type === 'UNLIKE', like_count: Math.max(0, p.like_count + (a.type === 'LIKE' ? -1 : 1)) });
    } else if (a.type === 'COMMENT') {
      s.removeComment(a.postId, a.id);
      const p = s.posts[a.postId];
      if (p) s.patch(a.postId, { comment_count: Math.max(0, p.comment_count - 1) });
    }
  });
}

/** Superpone las acciones aún no sincronizadas sobre datos del servidor (así el UI no "retrocede" offline). */
export async function applyPending(posts: Post[]): Promise<Post[]> {
  const pend = await outbox.pending();
  const likeState = new Map<string, boolean>();
  for (const a of pend) { if (a.type === 'LIKE') likeState.set(a.postId, true); if (a.type === 'UNLIKE') likeState.set(a.postId, false); }
  const newComments = new Map<string, number>();
  for (const a of pend) if (a.type === 'COMMENT') newComments.set(a.postId, (newComments.get(a.postId) ?? 0) + 1);
  return posts.map((p) => {
    let q = p;
    const l = likeState.get(p.id);
    if (l !== undefined && l !== p.liked_by_me) q = { ...q, liked_by_me: l, like_count: Math.max(0, q.like_count + (l ? 1 : -1)) };
    const nc = newComments.get(p.id);
    if (nc) q = { ...q, comment_count: q.comment_count + nc };
    return q;
  });
}
