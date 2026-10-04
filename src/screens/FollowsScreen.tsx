import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from '@/data/api';
import { useNav } from '@/hooks/useNav';
import { Avatar } from '@/ui/Avatar';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';
import type { Profile } from '@/domain/types';

export default function FollowsScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type: 'followers' | 'following' }>();
  const [list, setList] = useState<Profile[] | null>(null);
  const nav = useNav();
  useEffect(() => { api.fetchFollowList(id, type).then(setList).catch(() => setList([])); }, [id, type]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: type === 'followers' ? 'Seguidores' : 'Seguidos' }} />
      <FlatList
        data={list ?? []} keyExtractor={(p) => p.id}
        ListEmptyComponent={list ? <Text style={{ textAlign: 'center', color: C.sub, marginTop: 40, paddingHorizontal: 30 }}>Nada para mostrar (o la cuenta es privada y aún no te aprueba).</Text> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => nav.profile(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Avatar path={item.avatar_url} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{item.username}</Text>
              {item.full_name ? <Text style={{ color: C.sub, fontSize: 13 }}>{item.full_name}</Text> : null}
            </View>
            {item.is_private ? <Ionicons name="lock-closed" size={14} color={C.sub} /> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
