import { memo, useCallback, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Pressable, Share, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from '@/data/api';
import { mediaUrl } from '@/core/supabase';
import { timeAgo } from '@/core/time';
import { useAuth } from '@/state/auth';
import { useFeed } from '@/state/feed';
import { useSaved } from '@/state/saved';
import { useStories } from '@/state/stories';
import { useNav } from '@/hooks/useNav';
import { Avatar } from './Avatar';
import { isVideoPath, PostMedia } from './PostMedia';
import { StoryRing } from './StoryRing';
import { Text } from './Text';
import { C } from './theme';

const W = Dimensions.get('window').width;

export const PostCard = memo(function PostCard({ id, active, detail, onComment }: { id: string; active: boolean; detail?: boolean; onComment?: () => void }) {
  const post = useFeed((s) => s.posts[id]);
  const toggleLike = useFeed((s) => s.toggleLike);
  const saved = useSaved((s) => s.ids.has(id));
  const group = useStories((s) => s.groups.find((g) => g.user_id === post?.user_id));
  const seen = useStories((s) => s.seen);
  const nav = useNav();
  const [focused, setFocused] = useState(false);
  const lastTap = useRef(0);
  const pop = useRef(new Animated.Value(0)).current;
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  if (!post) return null;

  const ring: 'none' | 'unseen' | 'seen' = !group ? 'none' : group.stories.every((st) => seen.has(st.id)) ? 'seen' : 'unseen';
  const share = () => Share.share({ message: `instagramclone://post/${id}` });
  const burst = () => {
    pop.setValue(0);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.delay(250),
      Animated.timing(pop, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };
  const onImagePress = () => { // doble toque = like con corazón animado
    if (isVideoPath(post.image_path)) { nav.post(id); return; }
    const now = Date.now();
    if (now - lastTap.current < 300) { burst(); if (!post.liked_by_me) toggleLike(id); lastTap.current = 0; }
    else lastTap.current = now;
  };
  const openComments = () => (detail ? onComment?.() : nav.comments(id));
  const sendOptions = () => Alert.alert('Compartir', undefined, [
    { text: 'Enviar por mensaje', onPress: () => nav.inbox(id) },
    { text: 'Más opciones…', onPress: share },
    { text: 'Cancelar', style: 'cancel' },
  ]);
  const menu = () => {
    const mine = post.user_id === useAuth.getState().me?.id;
    Alert.alert(post.username, undefined, [
      { text: 'Compartir', onPress: sendOptions },
      { text: 'Ir al perfil', onPress: () => nav.profile(post.user_id) },
      ...(mine ? [{
        text: 'Eliminar', style: 'destructive' as const,
        onPress: () => Alert.alert('¿Eliminar publicación?', 'Esta acción no se puede deshacer.', [
          { text: 'Cancelar', style: 'cancel' as const },
          { text: 'Eliminar', style: 'destructive' as const, onPress: async () => {
            try { await api.deletePost(id); useFeed.getState().removePost(id); if (detail) router.back(); }
            catch (e: any) { Alert.alert('No se pudo eliminar', e?.message); }
          } },
        ]),
      }] : []),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Pressable style={s.userRow} onPress={() => (group ? router.push(`/story/${post.user_id}`) : nav.profile(post.user_id))}>
          <StoryRing state={ring}><Avatar path={post.avatar_url} size={30} /></StoryRing>
        </Pressable>
        <Pressable style={s.nameRow} onPress={() => nav.profile(post.user_id)}>
          <Text style={s.user}>{post.username}</Text>
          <Text style={s.dot}>•</Text>
          <Text style={s.time}>{timeAgo(post.created_at)}</Text>
        </Pressable>
        <Pressable onPress={menu} hitSlop={12}><Ionicons name="ellipsis-horizontal" size={20} color={C.text} /></Pressable>
      </View>

      <Pressable onPress={onImagePress}>
        <PostMedia path={post.image_path} active={active && focused} showMuteButton={isVideoPath(post.image_path)} style={{ width: W, height: W }} />
        <Animated.View pointerEvents="none" style={[s.bigHeart, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.15] }) }] }]}>
          <Ionicons name="heart" size={96} color="#fff" />
        </Animated.View>
      </Pressable>

      <View style={s.actions}>
        <View style={s.left}>
          <Pressable onPress={() => toggleLike(id)} hitSlop={8}>
            <Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={27} color={post.liked_by_me ? C.red : C.text} />
          </Pressable>
          <Pressable onPress={openComments} hitSlop={8}><Ionicons name="chatbubble-outline" size={24} color={C.text} style={{ transform: [{ scaleX: -1 }] }} /></Pressable>
          <Pressable onPress={sendOptions} hitSlop={8}><Ionicons name="paper-plane-outline" size={24} color={C.text} /></Pressable>
        </View>
        <Pressable onPress={() => useSaved.getState().toggle(post)} hitSlop={8}><Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={C.text} /></Pressable>
      </View>

      <Text style={s.likes}>{post.like_count} Me gusta</Text>
      {post.caption ? <Text style={s.caption}><Text style={s.user}>{post.username} </Text>{post.caption}</Text> : null}
      {!detail && post.comment_count > 0 ? (
        <Pressable onPress={openComments}><Text style={s.sub}>Ver los {post.comment_count} comentarios</Text></Pressable>
      ) : null}
      <Text style={s.when}>HACE {timeAgo(post.created_at).toUpperCase()}</Text>
    </View>
  );
});

const s = StyleSheet.create({
  card: { backgroundColor: C.bg, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  user: { fontWeight: '700', color: C.text, fontSize: 13.5 },
  dot: { color: C.mute, fontSize: 12 },
  time: { color: C.sub, fontSize: 12.5 },
  bigHeart: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  left: { flexDirection: 'row', gap: 18 },
  likes: { fontWeight: '700', paddingHorizontal: 12, fontSize: 13.5 },
  caption: { paddingHorizontal: 12, marginTop: 4, fontSize: 13.5, lineHeight: 18 },
  sub: { color: C.sub, paddingHorizontal: 12, marginTop: 4, fontSize: 13.5 },
  when: { color: C.mute, paddingHorizontal: 12, marginTop: 6, fontSize: 10, letterSpacing: 0.4 },
});
