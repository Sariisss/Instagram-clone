import { useEffect, useState } from 'react';
import { Dimensions, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '@/data/api';
import { useFeedList } from '@/hooks/useFeedList';
import { useNav } from '@/hooks/useNav';
import { useFeed } from '@/state/feed';
import { Avatar } from '@/ui/Avatar';
import { PostMedia, isVideoPath } from '@/ui/PostMedia';
import { Text, TextInput } from '@/ui/Text';
import { C } from '@/ui/theme';
import type { Profile } from '@/domain/types';

const W = Dimensions.get('window').width / 3;

export function GridItem({ id }: { id: string }) {
  const post = useFeed((s) => s.posts[id]);
  const nav = useNav();
  if (!post) return null;
  return <Pressable onPress={() => nav.post(id)}>
    <PostMedia path={post.image_path} style={{ width: W - 1, height: W - 1, margin: 0.5 }} />
    {isVideoPath(post.image_path) ? <Ionicons name="play" size={16} color="#fff" style={{ position: 'absolute', right: 8, top: 8 }} /> : null}
  </Pressable>;
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const { ids, refreshing, refresh, loadMore } = useFeedList('explore');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'foryou' | 'accounts'>('foryou');
  const [found, setFound] = useState<Profile[]>([]);
  const nav = useNav();
  const searching = q.trim().length > 0 || tab === 'accounts';

  useEffect(() => {
    if (!q.trim()) { setFound([]); return; }
    const t = setTimeout(() => api.searchProfiles(q.trim()).then(setFound).catch(() => {}), 300); // debounce
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.searchRow}>
        <View style={s.search}>
          <Ionicons name="search" size={18} color={C.sub} />
          <TextInput style={s.input} placeholder="Buscar" autoCapitalize="none" value={q} onChangeText={setQ} returnKeyType="search" />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={C.sub} /></Pressable> : null}
        </View>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 10 }}>
          {([['foryou', 'Para ti'], ['accounts', 'Cuentas']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[s.chip, (searching ? k === 'accounts' : k === 'foryou') && { backgroundColor: C.chip }]}>
              <Text style={[s.chipText, !(searching ? k === 'accounts' : k === 'foryou') && { color: C.sub }]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {searching ? (
        <FlatList
          key="accounts"
          data={found} keyExtractor={(p) => p.id} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.sub, marginTop: 40 }}>{q.trim() ? 'Sin resultados.' : 'Escribe un nombre de usuario.'}</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => nav.profile(item.id)} style={s.row}>
              <Avatar path={item.avatar_url} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700' }}>{item.username}</Text>
                {item.full_name ? <Text style={{ color: C.sub, fontSize: 13 }}>{item.full_name}</Text> : null}
              </View>
              {item.is_private ? <Ionicons name="lock-closed" size={14} color={C.sub} /> : null}
            </Pressable>
          )}
        />
      ) : (
        <FlatList key="grid" data={ids} numColumns={3} keyExtractor={(id) => id} renderItem={({ item }) => <GridItem id={item} />}
          refreshing={refreshing} onRefresh={refresh} onEndReached={loadMore} onEndReachedThreshold={0.5}
          initialNumToRender={15} windowSize={5} removeClippedSubviews
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.sub, marginTop: 50 }}>Todavía no hay publicaciones de otras cuentas.</Text>} />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  searchRow: { paddingHorizontal: 12, paddingVertical: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.chip, borderRadius: 12, height: 38, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, padding: 0 },
  chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10, backgroundColor: '#141414' },
  chipText: { fontWeight: '600', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
});
