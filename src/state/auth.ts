import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/core/supabase';
import type { Profile } from '@/domain/types';

type S = { session: Session | null; me: Profile | null; ready: boolean; loading: boolean; error: string | null; init: () => () => void; refreshMe: () => Promise<void> };

export const useAuth = create<S>()((set, get) => ({
  session: null, me: null, ready: false, loading: false, error: null,
  refreshMe: async () => {
    const user = get().session?.user;
    if (!user) return set({ me: null, loading: false });
    set({ loading: true, error: null });
    let data: Profile | null = null;
    let lastError = '';
    try {
      for (let attempt = 0; attempt < 3 && !data; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 700));
        const r = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (r.error) lastError = `${r.error.code ?? ''} ${r.error.message}`.trim();
        data = (r.data as Profile) ?? null;
        if (!data && !r.error) { // consulta OK pero sin fila (RLS o perfil inexistente): probar función con permisos del servidor
          const rpc = await supabase.rpc('my_profile');
          if (rpc.error) lastError = `${rpc.error.code ?? ''} ${rpc.error.message}`.trim();
          data = (rpc.data as Profile) ?? null;
        }
      }
      if (!data) { // cuenta sin perfil: se crea
        const base = (user.user_metadata?.username || user.email?.split('@')[0] || 'usuario').toString().toLowerCase().replace(/[^a-z0-9_.]/g, '') || 'usuario';
        for (const name of [base, `${base}${Math.floor(Math.random() * 9999)}`]) {
          const r = await supabase.from('profiles').insert({ id: user.id, username: name }).select('*').maybeSingle();
          if (r.error) lastError = `${r.error.code ?? ''} ${r.error.message}`.trim();
          if (r.data) { data = r.data as Profile; break; }
        }
      }
    } catch (e: any) {
      lastError = e?.message ?? String(e);
    }
    set({ me: data ?? get().me, error: data ? null : lastError || 'Sin respuesta del servidor', loading: false, ready: true });
  },
  init: () => {
    supabase.auth.getSession()
      .then(({ data }) => { set({ session: data.session }); return get().refreshMe(); })
      .catch(() => {})
      .finally(() => set({ ready: true }));

    // IMPORTANTE: dentro de este callback NO se debe hacer `await` de llamadas a supabase
    // (el cliente mantiene un lock y se produce un deadlock). Se difiere con setTimeout.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      set({ session });
      if (event === 'SIGNED_OUT') {
        const prevSession = get().session;
        const prevUserId = prevSession?.user.id;

        // Limpiar datos del usuario que sale (lazy import para evitar ciclos)
        if (prevUserId) {
          Promise.all([
            // Cola offline del usuario
            import('@/data/outbox').then(({ outbox }) => outbox.clear(prevUserId)),
            // Feed cacheado
            import('@/data/db').then(({ getDb }) =>
              getDb().then((db) => db.runAsync(`DELETE FROM feed_cache WHERE scope LIKE ?`, [`${prevUserId}%`])),
            ),
            // Posts guardados
            import('@/state/saved').then(({ useSaved }) => useSaved.getState().clearForUser(prevUserId)),
            // Búsquedas recientes
            import('@/data/recent').then(({ clearRecentForUser }) => clearRecentForUser(prevUserId)),
            // Historias vistas
            import('@/state/stories').then(({ useStories }) => useStories.getState().clearForUser(prevUserId)),
          ]).catch(() => {});
        }

        set({ me: null, loading: false, ready: true, error: null });
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        set({ loading: true });
        setTimeout(() => { get().refreshMe(); }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  },
}));
