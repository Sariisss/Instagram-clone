import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as api from '@/data/api';
import { supabase } from '@/core/supabase';

/** Nº de conversaciones con mensajes sin leer (insignia del icono de mensajes). */
export function useUnreadCount() {
  const [n, setN] = useState(0);
  const load = useCallback(() => { api.fetchUnreadByConv().then((s) => setN(s.size)).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const ch = supabase.channel('unread-badge').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  return n;
}
