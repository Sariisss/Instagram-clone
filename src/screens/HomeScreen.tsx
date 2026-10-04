import { useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeedList } from '@/hooks/useFeedList';
import { useNav } from '@/hooks/useNav';
import { useUnreadCount } from '@/hooks/useUnread';
import { PostCard } from '@/ui/PostCard';
import { StoriesBar } from '@/ui/StoriesBar';
import { Text } from '@/ui/Text';
import { C, logoFont } from '@/ui/theme';

export default function HomeScreen() {
  const { ids, refreshing, offline, refresh, loadMore } = useFeedList('home');
  const nav = useNav();
  const unread = useUnreadCount();
  // IDs visibles en el viewport: solo esas celdas descargan imágenes; al salir, se cancela la descarga.
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const onViewable = useRef(({ viewableItems }: { viewableItems: { item: string }[] }) => setVisible(new Set(viewableItems.map((v) => v.item)))).current;
  const viewCfg = useRef({ itemVisiblePercentThreshold: 5 }).current;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{
        title: '',
        headerLeft: () => <Text style={{ fontFamily: logoFont, fontSize: 32, lineHeight: 40 }}>Instagram</Text>,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Pressable onPress={() => nav.activity()} hitSlop={10}><Ionicons name="heart-outline" size={26} color={C.text} /></Pressable>
            <Pressable onPress={() => nav.inbox()} hitSlop={10}>
              <Ionicons name="paper-plane-outline" size={26} color={C.text} />
              {unread > 0 ? <View style={{ position: 'absolute', top: -6, right: -8, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}><Text style={{ fontSize: 10, fontWeight: '700' }}>{unread}</Text></View> : null}
            </Pressable>
          </View>
        ),
      }} />
      {offline ? <Text style={{ backgroundColor: '#3a2f00', color: '#ffd24a', padding: 6, textAlign: 'center', fontSize: 12 }}>Sin conexión · mostrando contenido guardado</Text> : null}
      <FlatList
        data={ids}
        extraData={visible}
        keyExtractor={(id) => id}
        renderItem={({ item }) => <PostCard id={item} active={visible.has(item)} />}
        ListHeaderComponent={<StoriesBar />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: C.sub, marginTop: 60, paddingHorizontal: 30 }}>Aún no hay publicaciones. Sigue a alguien o crea la primera.</Text>}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewCfg}
        refreshing={refreshing}
        onRefresh={refresh}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}
