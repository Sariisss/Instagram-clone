import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as api from '@/data/api';
import { supabase } from '@/core/supabase';
import { useAuth } from '@/state/auth';
import { useNav } from '@/hooks/useNav';
import { Avatar } from '@/ui/Avatar';
import { PostMedia } from '@/ui/PostMedia';
import { Text, TextInput } from '@/ui/Text';
import { BUBBLE_GRADIENT, C } from '@/ui/theme';
import type { Message, Post, Profile, ProfileInfo } from '@/domain/types';

const POST_LINK = /^instagramclone:\/\/post\/([0-9a-fA-F-]{36})$/;

function dividerLabel(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `HOY ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' }).toUpperCase()} ${time}`;
}

/** Tarjeta de publicación compartida dentro del chat. */
function PostLinkCard({ postId }: { postId: string }) {
  const nav = useNav();
  const [p, setP] = useState<Post | null | undefined>(undefined);
  useEffect(() => { api.postById(postId).then(setP).catch(() => setP(null)); }, [postId]);
  if (p === undefined) return <View style={[s.card, { height: 120, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={C.sub} /></View>;
  if (p === null) return <View style={[s.card, { padding: 14 }]}><Text style={{ color: C.sub }}>Publicación no disponible</Text></View>;
  return (
    <Pressable onPress={() => nav.post(postId)} style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
        <Avatar path={p.avatar_url} size={22} /><Text style={{ fontWeight: '600', fontSize: 12.5 }}>{p.username}</Text>
      </View>
      <PostMedia path={p.image_path} style={{ width: 240, height: 240 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }}>
        <Ionicons name="heart-outline" size={16} color={C.sub} />
        <Text style={{ color: C.sub, fontSize: 12 }} numberOfLines={1}>{p.like_count} · {p.caption ?? 'Ver publicación'}</Text>
      </View>
    </Pressable>
  );
}

export default function ChatScreen() {
  const { id: convId, u, name } = useLocalSearchParams<{ id: string; u: string; name: string }>();
  const me = useAuth((s) => s.me)!.id;
  const nav = useNav();
  const [msgs, setMsgs] = useState<Message[]>([]); // orden descendente (lista invertida)
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState<Profile | null>(null);
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const typingCh = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!u) return;
    api.getProfile(u).then(setOther).catch(() => {});
    api.profileInfo(u).then(setInfo).catch(() => {});
  }, [u]);

  useEffect(() => {
    api.fetchMessages(convId).then((m) => { setMsgs(m); api.markRead(convId); }).catch(() => {});

    // Mensajes + recibos (entregado / visto) por postgres_changes.
    const ch = supabase.channel(`chat:${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, (p) => {
        const m = p.new as Message;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur.map((x) => (x.id === m.id ? m : x)) : [m, ...cur]));
        if (m.sender_id !== me) api.markRead(convId);   // chat abierto => visto al instante
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, (p) => {
        const m = p.new as Message;
        setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
        const id = (p.old as Partial<Message>).id;
        if (id) setMsgs((cur) => cur.filter((m) => m.id !== id));
      })
      .subscribe();

    // "Escribiendo…": broadcast efímero (no toca la base de datos).
    const t = supabase.channel(`typing:${convId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === me) return;
        setTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 2500);
      })
      .subscribe();
    typingCh.current = t;

    return () => { supabase.removeChannel(ch); supabase.removeChannel(t); if (typingTimer.current) clearTimeout(typingTimer.current); };
  }, [convId, me]);

  const onChange = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastSent.current > 1500) { // throttle
      lastSent.current = now;
      typingCh.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: me } });
    }
  };

  const send = async (body = text.trim()) => {
    if (!body) return;
    setText('');
    const m: Message = { id: Crypto.randomUUID(), conversation_id: convId, sender_id: me, body, created_at: new Date().toISOString(), delivered_at: null, read_at: null, pending: true };
    setMsgs((cur) => [m, ...cur]);
    try { await api.sendMessage({ id: m.id, conversation_id: convId, body }); setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, pending: false } : x))); }
    catch { setMsgs((cur) => cur.filter((x) => x.id !== m.id)); }
  };

  const lastMine = msgs.find((m) => m.sender_id === me)?.id;
  const status = (m: Message) => (m.pending ? 'Enviando…' : m.read_at ? 'Visto' : m.delivered_at ? 'Entregado' : 'Enviado');
  const removeMessage = (message: Message) => {
    if (message.sender_id !== me || message.pending) return;
    Alert.alert('¿Eliminar mensaje?', 'Se eliminará para todos en este chat.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        setMsgs((cur) => cur.filter((m) => m.id !== message.id));
        try { await api.deleteMessage(message.id); }
        catch (e: any) {
          setMsgs((cur) => [...cur, message].sort((a, b) => b.created_at.localeCompare(a.created_at)));
          Alert.alert('No se pudo eliminar', e?.message ?? 'Inténtalo de nuevo.');
        }
      } },
    ]);
  };

  const intro = (
    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 4 }}>
      <Avatar path={other?.avatar_url} size={80} />
      <Text style={{ fontWeight: '700', fontSize: 16, marginTop: 8 }}>{other?.username ?? name}</Text>
      {other?.full_name ? <Text style={{ color: C.sub, fontSize: 13 }}>{other.full_name}</Text> : null}
      {info ? <Text style={{ color: C.sub, fontSize: 12 }}>{info.followers} seguidores · {info.posts} publicaciones</Text> : null}
      {u ? <Pressable onPress={() => nav.profile(u)} style={s.viewProfile}><Text style={{ fontWeight: '600', fontSize: 13 }}>Ver perfil</Text></Pressable> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        headerTitle: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar path={other?.avatar_url} size={34} />
            <View>
              <Text style={{ fontWeight: '700', fontSize: 15 }}>{other?.username ?? name ?? 'Chat'}</Text>
              {typing ? <Text style={{ color: C.green, fontSize: 11.5 }}>Escribiendo…</Text> : null}
            </View>
          </View>
        ),
      }} />
      <FlatList
        inverted data={msgs} keyExtractor={(m) => m.id}
        ListFooterComponent={intro}
        renderItem={({ item, index }) => {
          const mine = item.sender_id === me;
          const link = item.body.match(POST_LINK);
          const older = msgs[index + 1];
          const showTime = !older || new Date(item.created_at).getTime() - new Date(older.created_at).getTime() > 3600_000;
          return (
            <View>
              {showTime ? <Text style={s.time}>{dividerLabel(item.created_at)}</Text> : null}
              <Pressable onLongPress={mine ? () => removeMessage(item) : undefined} delayLongPress={450} style={{ paddingHorizontal: 12, paddingVertical: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {link ? <PostLinkCard postId={link[1]} /> : mine ? (
                  <LinearGradient colors={BUBBLE_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.bubble, { opacity: item.pending ? 0.7 : 1 }]}>
                    <Text style={s.msg}>{item.body}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[s.bubble, { backgroundColor: C.chip }]}><Text style={s.msg}>{item.body}</Text></View>
                )}
                {mine && item.id === lastMine ? <Text style={{ fontSize: 11, color: C.sub, marginTop: 3, marginRight: 4 }}>{status(item)}</Text> : null}
              </Pressable>
            </View>
          );
        }}
      />
      {typing ? <Text style={{ color: C.sub, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 }}>Escribiendo…</Text> : null}
      <View style={s.bar}>
        <View style={s.capsule}>
          <TextInput style={s.input} placeholder="Mensaje…" value={text} onChangeText={onChange} onSubmitEditing={() => send()} returnKeyType="send" />
          {text.trim() ? <Pressable onPress={() => send()}><Text style={{ color: C.blue, fontWeight: '700' }}>Enviar</Text></Pressable> : null}
        </View>
        {!text.trim() ? <Pressable onPress={() => send('❤️')} hitSlop={8}><Ionicons name="heart-outline" size={28} color={C.text} /></Pressable> : null}
      </View>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22 },
  msg: { fontSize: 14.5, lineHeight: 19 },
  time: { textAlign: 'center', color: C.mute, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginVertical: 10 },
  card: { width: 240, borderRadius: 16, overflow: 'hidden', backgroundColor: C.chip },
  viewProfile: { backgroundColor: C.chip, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10, marginTop: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 12 },
  capsule: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.chip, borderRadius: 24, paddingHorizontal: 16, height: 44 },
  input: { flex: 1, fontSize: 15, padding: 0 },
});
