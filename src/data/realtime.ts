import { supabase } from '@/core/supabase';
import { markAllDelivered } from './api';

/** Confirmación de entrega: al llegar un mensaje a este dispositivo (app abierta) se marca delivered_at. */
export function startDeliveryListener(me: string) {
  markAllDelivered().catch(() => {});
  const ch = supabase
    .channel(`delivery:${me}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
      const m = p.new as any;
      if (m.sender_id !== me && !m.delivered_at) {
        await supabase.from('messages').update({ delivered_at: new Date().toISOString() }).eq('id', m.id);
      }
    })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
