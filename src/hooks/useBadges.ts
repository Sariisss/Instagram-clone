import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as api from '@/data/api';
import { supabase } from '@/core/supabase';

/** Contadores del encabezado: mensajes sin leer (tiempo real) y solicitudes de seguimiento pendientes. */
export function useBadges() {
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const refresh = useCallback(() => {
    api.unreadCount().then(setUnread).catch(() => {});
    api.fetchFollowRequests().then((r) => setRequests(r.length)).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    const ch = supabase.channel('badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);
  return { unread, requests };
}
