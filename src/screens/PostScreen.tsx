import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from '@/data/api';
import { useAuth } from '@/state/auth';
import { usePostData } from '@/hooks/usePostData';
import { useNav } from '@/hooks/useNav';
import { useFeed } from '@/state/feed';
import { useSaved } from '@/state/saved';
import { PostMedia } from '@/ui/PostMedia';
import { PostCard } from '@/ui/PostCard';
import { CommentInput, CommentRow } from '@/ui/Comments';
import { Text } from '@/ui/Text';
import { C } from '@/ui/theme';
import type { Post } from '@/domain/types';

function FullscreenVideoPost({ post, focused }: { post: Post; focused: boolean }) {
  const [paused, setPaused] = useState(false);
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const me = useAuth((s) => s.me);
  const saved = useSaved((s) => s.ids.has(post.id));
  const isLiked = useFeed((s) => s.posts[post.id]?.liked_by_me ?? post.liked_by_me);
  const likeCount = useFeed((s) => s.posts[post.id]?.like_count ?? post.like_count);
  const commentCount = useFeed((s) => s.posts[post.id]?.comment_count ?? post.comment_count);
  const toggleLike = useFeed((s) => s.toggleLike);

  const removePost = () => Alert.alert('¿Eliminar publicación?', 'Esta acción no se puede deshacer.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: async () => {
      try { await api.deletePost(post.id); useFeed.getState().removePost(post.id); router.back(); }
      catch (e: any) { Alert.alert('No se pudo eliminar', e?.message); }
    } },
  ]);

  return (
    <View style={s.fullscreen}>
      <Pressable onPress={() => setPaused((value) => !value)} style={StyleSheet.absoluteFill} accessibilityLabel={paused ? 'Reanudar video' : 'Pausar video'}>
        <PostMedia path={post.image_path} active={focused && !paused} muted={false} style={StyleSheet.absoluteFill} />
      </Pressable>
      {paused ? <View pointerEvents="none" style={s.paused}><Ionicons name="play" size={38} color="#fff" /></View> : null}
      <View style={[s.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }} />
        {post.user_id === me?.id ? <Pressable onPress={removePost} hitSlop={10} style={s.iconButton}><Ionicons name="ellipsis-horizontal" size={24} color="#fff" /></Pressable> : null}
      </View>
      <View style={[s.bottomBar, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
        <View style={{ flex: 1, paddingRight: 16 }}>
          <Text style={s.username}>{post.username}</Text>
          {post.caption ? <Text numberOfLines={4} style={s.caption}>{post.caption}</Text> : null}
        </View>
        <View style={{ alignItems: 'center', gap: 20 }}>
          <Pressable onPress={() => toggleLike(post.id)} style={s.action}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={30} color={isLiked ? C.red : '#fff'} />
            <Text style={s.actionText}>{likeCount}</Text>
          </Pressable>
          <Pressable onPress={() => nav.comments(post.id)} style={s.action}>
            <Ionicons name="chatbubble-outline" size={27} color="#fff" />
            <Text style={s.actionText}>{commentCount}</Text>
          </Pressable>
          <Pressable onPress={() => Share.share({ message: `instagramclone://post/${post.id}` })} style={s.action}>
            <Ionicons name="paper-plane-outline" size={26} color="#fff" />
          </Pressable>
          <Pressable onPress={() => useSaved.getState().toggle(post)} style={s.action}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={26} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { post, comments, missing, send, remove } = usePostData(id);
  const inputRef = useRef<RNTextInput>(null);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const isVideoPost = !!post && /\.(mp4|mov|m4v|webm)$/i.test(post.image_path);
  const screenOptions = useMemo(() => ({
    title: isVideoPost ? 'post' : 'Publicación',
    headerShown: true,
    headerTransparent: isVideoPost,
  }), [isVideoPost]);

  if (missing) return <><Stack.Screen options={screenOptions} /><Text style={{ textAlign: 'center', marginTop: 80, color: C.sub }}>Esta publicación no existe o es privada.</Text></>;
  return (
    <>
      <Stack.Screen options={screenOptions} />
      {isVideoPost && post ? <FullscreenVideoPost post={post} focused={focused} /> : (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={post ? <PostCard id={id} active detail onComment={() => inputRef.current?.focus()} /> : null}
            renderItem={({ item }) => <CommentRow c={item} onDelete={() => remove(item)} />}
          />
          <CommentInput onSend={send} inputRef={inputRef} />
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const s = StyleSheet.create({
  fullscreen: { flex: 1, backgroundColor: '#000' },
  topBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  username: { color: '#fff', fontSize: 15, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 6 },
  bottomBar: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', alignItems: 'flex-end' },
  caption: { color: '#fff', fontSize: 14, lineHeight: 19, marginTop: 6, textShadowColor: '#000', textShadowRadius: 6 },
  action: { alignItems: 'center', gap: 3 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 5 },
  paused: { position: 'absolute', top: '50%', alignSelf: 'center', marginTop: -30, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
