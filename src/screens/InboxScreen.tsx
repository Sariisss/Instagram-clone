import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from '@/data/api';
import { supabase } from '@/core/supabase';
import { timeAgo } from '@/core/time';
import { useNav } from '@/hooks/useNav';
import { Avatar } from '@/ui/Avatar';
import { Text, TextInput } from '@/ui/Text';
import { C } from '@/ui/theme';
import type { InboxItem, Profile } from '@/domain/types';

export default function InboxScreen() {
  const { share } = useLocalSearchParams<{ share?: string }>(); // id de publicación a enviar (opcional)
  const [items, setItems] = useState<InboxItem[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const inputRef = useRef<RNTextInput>(null);
  const nav = useNav();
  const load = useCallback(() => api.fetchInbox().then((l) => setItems([...l].sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)))).catch(() => {}), []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    // Cada mensaje nuevo actualiza conversations.last_message_at (trigger SQL) => reordenamos la bandeja.
    const ch = supabase.channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const t = setTimeout(() => api.searchProfiles(q.trim()).then((l) => setFound(l.filter((p) => p.id !== api.uid()))).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);

  const open = async (convId: string, p: Profile) => {
    try {
      if (share) await api.sendMessage({ id: Crypto.randomUUID(), conversation_id: convId, body: `instagramclone://post/${share}` });
      nav.chat(convId, p.id, p.username);
      setQ('');
    } catch { Alert.alert('No se pudo abrir el chat', 'Revisa tu conexión.'); }
  };
  const start = async (p: Profile) => { try { await open(await api.getOrCreateConversation(p.id), p); } catch { Alert.alert('No se pudo abrir el chat', 'Revisa tu conexión.'); } };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{
        title: share ? 'Enviar publicación' : 'Mensajes',
        headerRight: () => <Pressable onPress={() => inputRef.current?.focus()} hitSlop={10}><Ionicons name="create-outline" size={25} color={C.text} /></Pressable>,
      }} />
      <View style={s.search}>
        <Ionicons name="search" size={18} color={C.sub} />
        <TextInput ref={inputRef} style={s.input} placeholder="Buscar usuario para chatear" autoCapitalize="none" value={q} onChangeText={setQ} />
        {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.sub} /></Pressable> : null}
      </View>
      {q.trim() ? (
        <FlatList data={found} keyExtractor={(p) => p.id} keyboardShouldPersistTaps="handled" renderItem={({ item }) => (
          <Pressable onPress={() => start(item)} style={s.row}>
            <Avatar path={item.avatar_url} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{item.username}</Text>
              {item.full_name ? <Text style={{ color: C.sub, fontSize: 13 }}>{item.full_name}</Text> : null}
            </View>
          </Pressable>
        )} />
      ) : (
        <FlatList
          data={items} keyExtractor={(c) => c.id}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.sub, marginTop: 40, paddingHorizontal: 30 }}>Busca a alguien arriba para empezar un chat.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item.id, item.other)} style={s.row}>
              <Avatar path={item.other.avatar_url} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: item.unread ? '700' : '600', fontSize: 14.5 }}>{item.other.username}</Text>
                <Text numberOfLines={1} style={{ color: item.unread ? C.text : C.sub, fontWeight: item.unread ? '600' : '400', marginTop: 2 }}>
                  {item.last_message_body?.startsWith('instagramclone://post/') ? '📷 Publicación' : item.last_message_body ?? 'Nueva conversación'} · {timeAgo(item.last_message_at)}
                </Text>
              </View>
              {item.unread ? <View style={s.dot} /> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.chip, borderRadius: 12, height: 38, paddingHorizontal: 12, marginHorizontal: 14, marginVertical: 8 },
  input: { flex: 1, fontSize: 15, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 9 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue },
});
