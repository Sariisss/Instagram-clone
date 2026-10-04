import { router, useSegments } from 'expo-router';

/**
 * Cada pestaña tiene su propio Stack: navegamos siempre DENTRO del grupo activo
 * ((home) | (explore) | (activity) | (profile)) para no mezclar pilas.
 */
export function useNav() {
  const seg = useSegments() as string[];
  const group = seg[0] === '(tabs)' && seg[1]?.startsWith('(') ? seg[1] : '(home)';
  const base = `/(tabs)/${group}`;
  const go = (href: any) => router.push(href);
  return {
    post: (id: string) => go(`${base}/post/${id}`),
    comments: (id: string) => go(`/comments/${id}`),
    profile: (id: string) => go(`${base}/profile/${id}`),
    follows: (id: string, type: 'followers' | 'following') => go({ pathname: `${base}/follows/${id}`, params: { type } }),
    chat: (convId: string, userId: string, name: string) => go({ pathname: `${base}/chat/${convId}`, params: { u: userId, name } }),
    inbox: (share?: string) => go({ pathname: '/(tabs)/(home)/inbox', params: share ? { share } : {} }),
    activity: () => go('/(tabs)/(activity)'),
  };
}
