import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/state/auth';
import { useStories } from '@/state/stories';
import type { StoryGroup } from '@/domain/types';
import { Avatar } from './Avatar';
import { StoryRing } from './StoryRing';
import { Text } from './Text';
import { C } from './theme';

type Item = { own: true } | { own?: false; group: StoryGroup };

export function StoriesBar() {
  const me = useAuth((x) => x.me);
  const { groups, seen, load, loadSeen } = useStories();
  useEffect(() => { loadSeen(); load(); }, [load, loadSeen]);
  const mine = groups.find((g) => g.user_id === me?.id);
  const data: Item[] = [{ own: true }, ...groups.filter((g) => g.user_id !== me?.id).map((group) => ({ group }))];

  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border }}>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={data}
        keyExtractor={(it) => (it.own ? 'own' : it.group.user_id)}
        contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 10, gap: 4 }}
        renderItem={({ item }) => {
          if (item.own) {
            const state = !mine ? 'none' : mine.stories.every((st) => seen.has(st.id)) ? 'seen' : 'unseen';
            return (
              <Pressable style={s.item} onPress={() => (mine ? router.push(`/story/${me!.id}`) : router.push('/create?mode=story'))}>
                <View>
                  <StoryRing state={state}><Avatar path={me?.avatar_url} size={64} /></StoryRing>
                  {!mine ? <View style={s.plus}><Ionicons name="add" size={14} color="#fff" /></View> : null}
                </View>
                <Text style={s.name} numberOfLines={1}>Tu historia</Text>
              </Pressable>
            );
          }
          const g = item.group;
          const allSeen = g.stories.every((st) => seen.has(st.id));
          return (
            <Pressable style={s.item} onPress={() => router.push(`/story/${g.user_id}`)}>
              <StoryRing state={allSeen ? 'seen' : 'unseen'}><Avatar path={g.avatar_url} size={64} /></StoryRing>
              <Text style={[s.name, allSeen && { color: C.sub }]} numberOfLines={1}>{g.username}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
const s = StyleSheet.create({
  item: { alignItems: 'center', width: 78 },
  plus: { position: 'absolute', right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: C.blue, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 11.5, marginTop: 3 },
});
