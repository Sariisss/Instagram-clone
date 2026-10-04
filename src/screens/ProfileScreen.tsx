import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Share, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as api from '@/data/api';
import { outbox } from '@/data/outbox';
import { useFeedList } from '@/hooks/useFeedList';
import { useNav } from '@/hooks/useNav';
import { useAuth } from '@/state/auth';
import { useFeed } from '@/state/feed';
import { useSaved } from '@/state/saved';
import { useStories } from '@/state/stories';
import { Avatar } from '@/ui/Avatar';
import { StoryRing } from '@/ui/StoryRing';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';
import { GridItem } from './ExploreScreen';
import type { Profile, ProfileInfo } from '@/domain/types';

export default function ProfileScreen({ own }: { own?: boolean }) {
  const params = useLocalSearchParams<{ id?: string }>();
  const me = useAuth((s) => s.me)!;
  const userId = own ? me.id : (params.id as string);
  const isMe = userId === me.id;
  const nav = useNav();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [tab, setTab] = useState<'grid' | 'saved'>('grid');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const savedCount = useSaved((s) => s.ids.size);
  const group = useStories((s) => s.groups.find((g) => g.user_id === userId));
  const seen = useStories((s) => s.seen);
  const feed = useFeedList('user', userId); // RLS devuelve vacío si no tienes acceso

  const load = useCallback(async () => {
    try { const [p, i] = await Promise.all([api.getProfile(userId), api.profileInfo(userId)]); setProfile(p); setInfo(i); } catch {}
  }, [userId]);
  useFocusEffect(useCallback(() => { load(); useStories.getState().load(); }, [load]));

  useEffect(() => {
    if (tab !== 'saved') return;
    useSaved.getState().list().then((list) => {
      const known = useFeed.getState().posts;
      useFeed.getState().upsert(list.filter((p) => !known[p.id]));
      setSavedIds(list.map((p) => p.id));
    });
  }, [tab, savedCount]);

  if (!profile || !info) return <View style={{ flex: 1, backgroundColor: C.bg }}><Stack.Screen options={{ title: '' }} /></View>;
  const canView = isMe || !profile.is_private || info.my_status === 'accepted';
  const following = info.my_status !== 'none';
  const label = info.my_status === 'accepted' ? 'Siguiendo' : info.my_status === 'pending' ? 'Solicitado' : 'Seguir';
  const ring: 'none' | 'unseen' | 'seen' = !group ? 'none' : group.stories.every((st) => seen.has(st.id)) ? 'seen' : 'unseen';

  const toggleFollow = async () => {
    if (info.my_status === 'none') {
      setInfo({ ...info, my_status: profile.is_private ? 'pending' : 'accepted', followers: info.followers + (profile.is_private ? 0 : 1) });
      await outbox.enqueue({ type: 'FOLLOW', userId });
    } else {
      setInfo({ ...info, my_status: 'none', followers: Math.max(0, info.followers - (info.my_status === 'accepted' ? 1 : 0)) });
      await outbox.enqueue({ type: 'UNFOLLOW', userId });
    }
  };
  const message = async () => { try { nav.chat(await api.getOrCreateConversation(userId), userId, profile.username); } catch { Alert.alert('Sin conexión'); } };

  const titleNode = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {profile.is_private ? <Ionicons name="lock-closed" size={15} color={C.text} /> : null}
      <Text style={{ fontWeight: '700', fontSize: isMe ? 22 : 17 }}>{profile.username}</Text>
    </View>
  );

  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, gap: 18 }}>
        <Pressable disabled={!group} onPress={() => router.push(`/story/${userId}`)}>
          <StoryRing state={ring}><Avatar path={profile.avatar_url} size={ring === 'none' ? 82 : 78} /></StoryRing>
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
          <Stat n={info.posts} l="Publicaciones" />
          <Stat n={info.followers} l="Seguidores" onPress={() => nav.follows(userId, 'followers')} />
          <Stat n={info.following} l="Seguidos" onPress={() => nav.follows(userId, 'following')} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
        <Text style={{ fontWeight: '700', fontSize: 14 }}>{profile.full_name ?? profile.username}</Text>
        {profile.bio ? <Text style={{ fontSize: 13.5, lineHeight: 18, marginTop: 2 }}>{profile.bio}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, marginTop: 14, marginBottom: 14 }}>
        {isMe ? (
          <>
            <Pressable style={[s.btn, s.grey]} onPress={() => router.push('/edit-profile')}><Text style={s.btnText}>Editar perfil</Text></Pressable>
            <Pressable style={[s.btn, s.grey]} onPress={() => Share.share({ message: `instagramclone://profile/${userId}` })}><Text style={s.btnText}>Compartir perfil</Text></Pressable>
          </>
        ) : (
          <>
            <Pressable style={[s.btn, following ? s.grey : { backgroundColor: C.blue }]} onPress={toggleFollow}><Text style={s.btnText}>{label}</Text></Pressable>
            <Pressable style={[s.btn, s.grey]} onPress={message}><Text style={s.btnText}>Enviar mensaje</Text></Pressable>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
        {(isMe ? (['grid', 'saved'] as const) : (['grid'] as const)).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: tab === k ? 1.5 : 0, borderColor: C.text }}>
            <Ionicons name={k === 'grid' ? 'grid-outline' : 'bookmark-outline'} size={23} color={tab === k ? C.text : C.mute} />
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={isMe ? {
        title: '',
        headerLeft: () => titleNode,
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 22, alignItems: 'center' }}>
            <Pressable onPress={() => router.push('/create')} hitSlop={8}><Feather name="plus-square" size={24} color={C.text} /></Pressable>
            <Pressable onPress={() => router.push('/settings')} hitSlop={8}><Ionicons name="menu" size={28} color={C.text} /></Pressable>
          </View>
        ),
      } : { headerTitle: () => titleNode }} />
      <FlatList
        data={tab === 'saved' && isMe ? savedIds : canView ? feed.ids : []} numColumns={3} keyExtractor={(i) => i} renderItem={({ item }) => <GridItem id={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={tab === 'saved' && isMe ? <Text style={{ textAlign: 'center', color: C.sub, marginTop: 30 }}>Aún no has guardado publicaciones.</Text> : !canView ? (
          <View style={{ alignItems: 'center', marginTop: 28, gap: 6 }}>
            <Ionicons name="lock-closed-outline" size={46} color={C.text} />
            <Text style={{ fontWeight: '700' }}>Esta cuenta es privada</Text>
            <Text style={{ color: C.sub }}>Sigue esta cuenta para ver sus fotos.</Text>
          </View>
        ) : <Text style={{ textAlign: 'center', color: C.sub, marginTop: 30 }}>Todavía no hay publicaciones.</Text>}
        refreshing={feed.refreshing} onRefresh={() => { feed.refresh(); load(); }} onEndReached={feed.loadMore}
        windowSize={5} removeClippedSubviews
      />
    </View>
  );
}
const Stat = ({ n, l, onPress }: { n: number; l: string; onPress?: () => void }) => (
  <Pressable onPress={onPress} style={{ alignItems: 'center' }}><Text style={{ fontWeight: '700', fontSize: 17 }}>{n}</Text><Text style={{ fontSize: 13 }}>{l}</Text></Pressable>
);
const s = StyleSheet.create({
  btn: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  grey: { backgroundColor: C.chip },
  btnText: { fontWeight: '600', fontSize: 13.5 },
});
