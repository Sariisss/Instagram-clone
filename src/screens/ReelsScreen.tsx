import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Pressable, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { mediaUrl } from '@/core/supabase';
import { useFeedList } from '@/hooks/useFeedList';
import { useNav } from '@/hooks/useNav';
import { useFeed } from '@/state/feed';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';

const ITEM_HEIGHT = Dimensions.get('window').height - 112;

function ReelPlayer({ path, active, paused, togglePaused }: { path: string; active: boolean; paused: boolean; togglePaused: () => void }) {
  const [muted, setMuted] = useState(false);
  const player = useVideoPlayer(mediaUrl(path), (p) => { p.loop = true; p.muted = false; });

  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [active, paused, player]);

  const toggleMuted = () => {
    const nextMuted = !player.muted;
    player.muted = nextMuted;
    setMuted(nextMuted);
  };

  return (
    <>
      <Pressable onPress={togglePaused} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} accessibilityLabel={paused ? 'Reanudar video' : 'Pausar video'}>
        <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />
      </Pressable>
      <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, marginTop: -24, flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
        <Pressable onPress={togglePaused} hitSlop={8} accessibilityLabel={paused ? 'Reproducir' : 'Pausar'} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={paused ? 'play' : 'pause'} size={24} color="#fff" />
        </Pressable>
        <Pressable onPress={toggleMuted} hitSlop={8} accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={24} color="#fff" />
        </Pressable>
      </View>
    </>
  );
}

function ReelItem({ id, active }: { id: string; active: boolean }) {
  const [paused, setPaused] = useState(false);
  const post = useFeed((s) => s.posts[id]);
  const toggleLike = useFeed((s) => s.toggleLike);
  const nav = useNav();
  if (!post) return null;
  return (
    <View style={{ height: ITEM_HEIGHT, backgroundColor: '#000' }}>
      <ReelPlayer path={post.image_path} active={active} paused={paused} togglePaused={() => setPaused((value) => !value)} />
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: 18, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, textShadowColor: '#000', textShadowRadius: 6 }}>{post.username}</Text>
          {post.caption ? <Text numberOfLines={3} style={{ marginTop: 6, textShadowColor: '#000', textShadowRadius: 6 }}>{post.caption}</Text> : null}
        </View>
        <View style={{ alignItems: 'center', gap: 18 }}>
          <Pressable onPress={() => toggleLike(id)} hitSlop={8} style={{ alignItems: 'center' }}>
            <Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={30} color={post.liked_by_me ? C.red : '#fff'} />
            <Text style={{ fontSize: 11, fontWeight: '600' }}>{post.like_count}</Text>
          </Pressable>
          <Pressable onPress={() => nav.comments(id)} hitSlop={8} style={{ alignItems: 'center' }}>
            <Ionicons name="chatbubble-outline" size={27} color="#fff" />
            <Text style={{ fontSize: 11, fontWeight: '600' }}>{post.comment_count}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ReelsScreen() {
  const { ids, refreshing, refresh, loadMore } = useFeedList('reels');
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const [visible, setVisible] = useState<string | null>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: { item: string }[] }) => setVisible(viewableItems[0]?.item ?? null)).current;
  const viewCfg = useRef({ itemVisiblePercentThreshold: 60 }).current;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: 'Reels', headerRight: () => <Pressable onPress={() => router.push('/create?mode=reel')} hitSlop={10}><Ionicons name="videocam-outline" size={24} color={C.text} /></Pressable> }} />
      <FlatList
        data={ids} keyExtractor={(id) => id} pagingEnabled
        renderItem={({ item }) => <ReelItem id={item} active={focused && visible === item} />}
        onViewableItemsChanged={onViewable} viewabilityConfig={viewCfg}
        refreshing={refreshing} onRefresh={refresh} onEndReached={loadMore} onEndReachedThreshold={0.6}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}><Ionicons name="videocam-outline" size={40} color={C.sub} /><Text style={{ color: C.sub, textAlign: 'center' }}>Aún no hay reels.</Text><Pressable onPress={() => router.push('/create?mode=reel')}><Text style={{ color: C.blue, fontWeight: '700' }}>Crear un reel</Text></Pressable></View>}
      />
    </View>
  );
}