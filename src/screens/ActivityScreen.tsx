import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from '@/data/api';
import { outbox } from '@/data/outbox';
import { mediaUrl } from '@/core/supabase';
import { timeAgo } from '@/core/time';
import { useNav } from '@/hooks/useNav';
import { Avatar } from '@/ui/Avatar';
import { CachedImage } from '@/ui/CachedImage';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';
import type { Profile } from '@/domain/types';

type Item = {
  key: string; kind: 'like' | 'comment' | 'follow'; actor_id: string; username: string; avatar: string | null;
  post_id?: string; thumb?: string | null; body?: string | null; created_at: string; priv?: boolean;
};
const FILTERS = [['all', 'Todo'], ['follows', 'Seguidores'], ['comments', 'Comentarios'], ['likes', 'Me gusta']] as const;
type Filter = (typeof FILTERS)[number][0];

export default function ActivityScreen() {
  const [requests, setRequests] = useState<Profile[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [fmap, setFmap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState(false);
  const nav = useNav();

  const load = useCallback(async () => {
    try {
      const [reqs, acts, fol, fm] = await Promise.all([api.fetchFollowRequests(), api.fetchActivity(), api.fetchNewFollowers(), api.myFollowingMap()]);
      const profs = await api.profilesByIds(Array.from(new Set(acts.map((a) => a.actor_id))));
      const imgs = await api.postImages(Array.from(new Set(acts.map((a) => a.post_id))));
      const list: Item[] = [
        ...acts.map((a, i) => ({ key: `${a.kind}-${a.actor_id}-${a.post_id}-${a.created_at}-${i}`, kind: a.kind, actor_id: a.actor_id, username: a.actor_username, avatar: profs[a.actor_id]?.avatar_url ?? null, post_id: a.post_id, thumb: imgs[a.post_id] ?? null, body: a.body, created_at: a.created_at })),
        ...fol.map((f) => ({ key: `follow-${f.profile.id}`, kind: 'follow' as const, actor_id: f.profile.id, username: f.profile.username, avatar: f.profile.avatar_url, created_at: f.created_at, priv: f.profile.is_private })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));
      setRequests(reqs); setItems(list); setFmap(fm);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (p: Profile, ok: boolean) => {
    setRequests((r) => r.filter((x) => x.id !== p.id));
    try { await api.respondRequest(p.id, ok); if (ok) load(); } catch { load(); }
  };
  const toggleFollow = async (it: Item) => {
    if (!fmap[it.actor_id]) { setFmap({ ...fmap, [it.actor_id]: it.priv ? 'pending' : 'accepted' }); await outbox.enqueue({ type: 'FOLLOW', userId: it.actor_id }); }
    else { const { [it.actor_id]: _, ...rest } = fmap; setFmap(rest); await outbox.enqueue({ type: 'UNFOLLOW', userId: it.actor_id }); }
  };

  const sections = useMemo(() => {
    const f = items.filter((i) => filter === 'all' || (filter === 'follows' && i.kind === 'follow') || (filter === 'comments' && i.kind === 'comment') || (filter === 'likes' && i.kind === 'like'));
    const b: Record<string, Item[]> = { Nuevo: [], 'Esta semana': [], 'Este mes': [], Anteriores: [] };
    const now = Date.now();
    for (const i of f) {
      const age = now - new Date(i.created_at).getTime();
      (age < 864e5 ? b.Nuevo : age < 6048e5 ? b['Esta semana'] : age < 2592e6 ? b['Este mes'] : b.Anteriores).push(i);
    }
    return Object.entries(b).filter(([, d]) => d.length).map(([title, data]) => ({ title, data }));
  }, [items, filter]);

  const showRequests = requests.length > 0 && (filter === 'all' || filter === 'follows');

  const text = (it: Item) =>
    it.kind === 'like' ? ' le dio me gusta a tu publicación.' : it.kind === 'comment' ? ` comentó: ${it.body}` : ' comenzó a seguirte.';
  const badge = (k: Item['kind']) => (k === 'like' ? { n: 'heart', bg: C.red } : k === 'comment' ? { n: 'chatbubble', bg: '#393939' } : { n: 'person-add', bg: C.blue });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: 'Actividad' }} />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.key}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <View style={s.pills}>
              {FILTERS.map(([k, label]) => (
                <Pressable key={k} onPress={() => setFilter(k)} style={[s.pill, filter === k && { backgroundColor: '#393939' }]}>
                  <Text style={{ fontWeight: '600', fontSize: 13, color: filter === k ? C.text : C.sub }}>{label}</Text>
                </Pressable>
              ))}
            </View>
            {showRequests ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <Pressable style={s.banner} onPress={() => setOpen(!open)}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700' }}>Solicitudes de seguimiento</Text>
                    <Text style={{ color: C.sub, fontSize: 12.5 }}>Aprueba o ignora solicitudes</Text>
                  </View>
                  <View style={s.count}><Text style={{ fontSize: 11, fontWeight: '700' }}>{requests.length}</Text></View>
                  <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={C.mute} />
                </Pressable>
                {open ? requests.map((p) => (
                  <View key={p.id} style={[s.row, { paddingHorizontal: 4 }]}>
                    <Pressable onPress={() => nav.profile(p.id)}><Avatar path={p.avatar_url} size={46} /></Pressable>
                    <Text style={{ flex: 1, fontSize: 13 }}><Text style={{ fontWeight: '700' }}>{p.username}</Text> quiere seguirte</Text>
                    <Pressable onPress={() => respond(p, true)} style={[s.btn, { backgroundColor: C.blue }]}><Text style={s.btnText}>Confirmar</Text></Pressable>
                    <Pressable onPress={() => respond(p, false)} style={[s.btn, { backgroundColor: C.chip }]}><Text style={s.btnText}>Eliminar</Text></Pressable>
                  </View>
                )) : null}
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={s.section}>{section.title}</Text>}
        renderItem={({ item }) => {
          const b = badge(item.kind);
          return (
            <Pressable style={s.row} onPress={() => (item.post_id ? nav.post(item.post_id) : nav.profile(item.actor_id))}>
              <View>
                <Avatar path={item.avatar} size={46} />
                <View style={[s.mini, { backgroundColor: b.bg }]}><Ionicons name={b.n as any} size={11} color="#fff" /></View>
              </View>
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 17 }}>
                <Text style={{ fontWeight: '700' }}>{item.username}</Text>{text(item)} <Text style={{ color: C.mute }}>{timeAgo(item.created_at)}</Text>
              </Text>
              {item.kind === 'follow' ? (
                <Pressable onPress={() => toggleFollow(item)} style={[s.btn, { backgroundColor: fmap[item.actor_id] ? C.chip : C.blue }]}>
                  <Text style={s.btnText}>{fmap[item.actor_id] === 'accepted' ? 'Siguiendo' : fmap[item.actor_id] === 'pending' ? 'Solicitado' : 'Seguir también'}</Text>
                </Pressable>
              ) : item.thumb ? <CachedImage url={mediaUrl(item.thumb)} style={{ width: 46, height: 46, borderRadius: 8 }} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.sub, marginTop: 40 }}>Sin actividad todavía.</Text>}
        ListFooterComponent={sections.length ? (
          <View style={{ alignItems: 'center', paddingVertical: 28, gap: 6 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#1c1c1c', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={24} color={C.sub} /></View>
            <Text style={{ fontWeight: '700' }}>Estás al día</Text>
            <Text style={{ color: C.sub, fontSize: 12.5 }}>Has visto toda la actividad reciente.</Text>
          </View>
        ) : null}
      />
    </View>
  );
}
const s = StyleSheet.create({
  pills: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: '#1c1c1c' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1c1c1c', borderRadius: 12, padding: 12 },
  count: { backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  section: { fontWeight: '700', fontSize: 15, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  mini: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg },
  btn: { paddingHorizontal: 12, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontWeight: '600', fontSize: 12.5 },
});
